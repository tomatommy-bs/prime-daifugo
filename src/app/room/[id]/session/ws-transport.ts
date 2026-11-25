/**
 * Production room transport: a hand-written reconnecting WebSocket (spec §3.4, §9.1).
 *
 * - Backoff 0.5, 1, 2, 4, 8, then a 10 s cap, each with ±30 % jitter, retrying forever.
 * - No reconnect after the terminal close codes 4000-4006 or after a `bye` frame.
 * - Liveness: the text `ping` every 20 s (answered with `pong` by the server's auto-response);
 *   if no frame at all arrives for 45 s the socket is dropped and a new one opened at once.
 * - Mobile resume: on `visibilitychange→visible`, `online` and `pageshow(persisted)` it reconnects
 *   immediately (skipping backoff) when there is no socket, it is closing/closed, it is OPEN but
 *   quiet for over 25 s, or it has been CONNECTING for over 5 s. A younger CONNECTING socket is
 *   left alone, so the burst of triggers a bfcache restore fires opens one socket, not three.
 *
 * Timers, the clock, randomness, the WebSocket constructor and the event targets are injectable.
 */
import { PING, PONG, TERMINAL_CLOSE_CODES } from '@/shared/protocol'
import { READY_STATE, type RoomTransport, isByeFrame } from './transport'

export const BACKOFF_STEPS_MS = [500, 1000, 2000, 4000, 8000, 10_000] as const
export const BACKOFF_JITTER = 0.3
export const PING_INTERVAL_MS = 20_000
export const LIVENESS_TIMEOUT_MS = 45_000
export const RESUME_QUIET_MS = 25_000
/** A resume trigger leaves a socket that started connecting less than this long ago alone. */
export const RESUME_CONNECTING_GRACE_MS = 5_000

/** The subset of `WebSocket` the transport uses. */
export type SocketLike = {
  readyState: number
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: { code: number }) => void) | null
  onerror: ((ev: unknown) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type SocketCtor = new (url: string) => SocketLike

type TimerId = ReturnType<typeof setTimeout>

export type TransportTimers = {
  setTimeout(fn: () => void, ms: number): TimerId
  clearTimeout(id: TimerId): void
  setInterval(fn: () => void, ms: number): TimerId
  clearInterval(id: TimerId): void
}

type Listenable = {
  addEventListener(type: string, fn: (ev: unknown) => void): void
  removeEventListener(type: string, fn: (ev: unknown) => void): void
}

export type WsTransportOptions = {
  WebSocketCtor?: SocketCtor
  timers?: TransportTimers
  now?: () => number
  /** [0,1), for the backoff jitter */
  random?: () => number
  /** receives `online` and `pageshow`; defaults to `window` */
  win?: Listenable | null
  /** receives `visibilitychange`; defaults to `document` */
  doc?: (Listenable & { visibilityState?: string }) | null
}

/** Delay before reconnect attempt `attempt` (0-based): the step, ±30 % with `r` ∈ [0,1). */
export function backoffDelay(attempt: number, r: number): number {
  const base = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)]
  return Math.round(base * (1 + (r * 2 - 1) * BACKOFF_JITTER))
}

const defaultTimers = (): TransportTimers => ({
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
})

/** Close code used when the client drops a socket itself (liveness or resume). */
const CLIENT_DROP_CODE = 4900
/** Code reported to `onClose` for a socket the client dropped as dead. */
export const ABNORMAL_CLOSE = 1006

export class WsTransport implements RoomTransport {
  onOpen: (() => void) | null = null
  onMessage: ((text: string) => void) | null = null
  onClose: ((code: number, reconnecting: boolean) => void) | null = null
  onError: (() => void) | null = null

  private readonly Ctor: SocketCtor | null
  private readonly timers: TransportTimers
  private readonly now: () => number
  private readonly random: () => number
  private readonly win: Listenable | null
  private readonly doc: (Listenable & { visibilityState?: string }) | null

  private url: string | null = null
  private socket: SocketLike | null = null
  private active = false
  private byeSeen = false
  private attempt = 0
  private lastFrameAt = 0
  private socketCreatedAt = 0
  private reconnectTimer: TimerId | null = null
  private pingTimer: TimerId | null = null
  private livenessTimer: TimerId | null = null
  private listening = false

  constructor(options: WsTransportOptions = {}) {
    this.Ctor =
      options.WebSocketCtor ??
      ((globalThis as { WebSocket?: unknown }).WebSocket as SocketCtor | undefined) ??
      null
    this.timers = options.timers ?? defaultTimers()
    this.now = options.now ?? (() => Date.now())
    this.random = options.random ?? Math.random
    this.win =
      options.win !== undefined
        ? options.win
        : typeof window === 'undefined'
          ? null
          : (window as unknown as Listenable)
    this.doc =
      options.doc !== undefined
        ? options.doc
        : typeof document === 'undefined'
          ? null
          : (document as unknown as Listenable & { visibilityState?: string })
  }

  get readyState(): number {
    return this.socket?.readyState ?? READY_STATE.CLOSED
  }

  connect(url: string): void {
    this.stopSocket()
    this.clearReconnect()
    this.url = url
    this.active = true
    this.byeSeen = false
    this.attempt = 0
    this.listen()
    this.openSocket()
  }

  send(text: string): boolean {
    if (this.socket === null || this.socket.readyState !== READY_STATE.OPEN) {
      return false
    }
    this.socket.send(text)
    return true
  }

  /**
   * Drop the current socket and open a new one now, skipping backoff (e.g. the session gave up
   * waiting for a `welcome`). The dropped socket reports `onClose(1006, true)`.
   */
  reconnectNow(): void {
    this.forceReconnect()
  }

  close(code = 1000): void {
    this.active = false
    this.clearReconnect()
    this.unlisten()
    const socket = this.socket
    this.stopSocket()
    if (socket !== null) {
      try {
        socket.close(code)
      } catch {
        // already closed
      }
    }
  }

  /* -------------------------------------------------------------- */

  private openSocket(): void {
    if (this.url === null || this.Ctor === null) {
      return
    }
    let socket: SocketLike
    try {
      socket = new this.Ctor(this.url)
    } catch {
      this.onError?.()
      this.onClose?.(ABNORMAL_CLOSE, true)
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    this.lastFrameAt = this.now()
    this.socketCreatedAt = this.lastFrameAt
    socket.onopen = () => {
      if (this.socket !== socket) {
        return
      }
      this.attempt = 0
      this.lastFrameAt = this.now()
      this.pingTimer = this.timers.setInterval(() => this.send(PING), PING_INTERVAL_MS)
      this.armLiveness()
      this.onOpen?.()
    }
    socket.onmessage = (ev) => {
      if (this.socket !== socket) {
        return
      }
      this.lastFrameAt = this.now()
      this.armLiveness()
      const text = typeof ev.data === 'string' ? ev.data : String(ev.data)
      if (text === PONG) {
        return
      }
      if (isByeFrame(text)) {
        this.byeSeen = true
      }
      this.onMessage?.(text)
    }
    socket.onerror = () => {
      if (this.socket === socket) {
        this.onError?.()
      }
    }
    socket.onclose = (ev) => {
      if (this.socket !== socket) {
        return
      }
      this.stopSocket()
      const terminal = this.byeSeen || TERMINAL_CLOSE_CODES.includes(ev.code)
      if (terminal) {
        this.active = false
        this.unlisten()
      }
      this.onClose?.(ev.code, !terminal)
      if (!terminal && this.active) {
        this.scheduleReconnect()
      }
    }
  }

  /** Detach and forget the current socket and its timers (does not close it). */
  private stopSocket(): void {
    const socket = this.socket
    if (socket !== null) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
    }
    this.socket = null
    if (this.pingTimer !== null) {
      this.timers.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.livenessTimer !== null) {
      this.timers.clearTimeout(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  private armLiveness(): void {
    if (this.livenessTimer !== null) {
      this.timers.clearTimeout(this.livenessTimer)
    }
    this.livenessTimer = this.timers.setTimeout(() => {
      this.livenessTimer = null
      this.forceReconnect()
    }, LIVENESS_TIMEOUT_MS)
  }

  private scheduleReconnect(): void {
    this.clearReconnect()
    const delay = backoffDelay(this.attempt, this.random())
    this.attempt += 1
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null
      if (this.active) {
        this.openSocket()
      }
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      this.timers.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /** Drop the current socket (if any) as dead and open a new one now, skipping backoff. */
  private forceReconnect(): void {
    if (!this.active) {
      return
    }
    this.clearReconnect()
    const socket = this.socket
    if (socket !== null) {
      this.stopSocket()
      try {
        socket.close(CLIENT_DROP_CODE)
      } catch {
        // a half-open socket may throw; it is detached either way
      }
      this.onClose?.(ABNORMAL_CLOSE, true)
    }
    if (this.active) {
      this.openSocket()
    }
  }

  private readonly onResume = (): void => {
    if (!this.active) {
      return
    }
    const socket = this.socket
    const now = this.now()
    if (socket?.readyState === READY_STATE.CONNECTING) {
      if (now - this.socketCreatedAt > RESUME_CONNECTING_GRACE_MS) {
        this.forceReconnect()
      }
      return
    }
    const open = socket?.readyState === READY_STATE.OPEN
    if (!open || now - this.lastFrameAt > RESUME_QUIET_MS) {
      this.forceReconnect()
    }
  }

  private readonly onVisibility = (): void => {
    if (this.doc?.visibilityState === 'visible') {
      this.onResume()
    }
  }

  private readonly onPageShow = (ev: unknown): void => {
    if ((ev as { persisted?: boolean } | null)?.persisted) {
      this.onResume()
    }
  }

  private listen(): void {
    if (this.listening) {
      return
    }
    this.listening = true
    this.doc?.addEventListener('visibilitychange', this.onVisibility)
    this.win?.addEventListener('online', this.onResume)
    this.win?.addEventListener('pageshow', this.onPageShow)
  }

  private unlisten(): void {
    if (!this.listening) {
      return
    }
    this.listening = false
    this.doc?.removeEventListener('visibilitychange', this.onVisibility)
    this.win?.removeEventListener('online', this.onResume)
    this.win?.removeEventListener('pageshow', this.onPageShow)
  }
}

export function createWsTransport(options?: WsTransportOptions): RoomTransport {
  return new WsTransport(options)
}
