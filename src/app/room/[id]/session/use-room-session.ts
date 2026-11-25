/**
 * `useRoomSession(roomId)` (spec §9.1, RQ-C1): the UI's only contact with the realtime backend.
 *
 * The hook glues a reconnecting `RoomTransport`, the pure `clientReduce` and the `ServerClock`
 * together in a `RoomSessionController` and exposes it as a `RoomSession` through
 * `useSyncExternalStore`.
 *
 * - `hello` carries the sid (`src/lib/session-id.ts`), the `name` cookie and the last seq/epoch,
 *   kept in memory and mirrored per room into sessionStorage so a reload can ask for a replay.
 * - Commands get generated ids and resolve on their `ack`; no ack in 10 s → `timeout`, socket gone
 *   → `disconnected`.
 * - Connection: `connecting` (also while reconnecting; the board keeps its last state),
 *   `waiting-sync` (socket open, no welcome yet), `open`, `closed` (terminal bye; `closeReason`
 *   set) and `error` (no backend URL, a protocol bye, or repeated failures before the first
 *   welcome).
 */
import { REALTIME_URL, wsUrl } from '@/constants/env'
import { getOrCreateSid } from '@/lib/session-id'
import { PV, randomId } from '@/shared/ids'
import {
  type ByeReason,
  CLOSE,
  type Cmd,
  type CmdFrame,
  type Hello,
  parseServerFrame,
} from '@/shared/protocol'
import { DEFAULT_RULE } from '@/shared/rule-options'
import Cookies from 'js-cookie'
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { type TurnClock, createTurnClock } from '../_ui/board/TurnTimer'
import { viewToPresence } from './adapter'
import {
  type ClientState,
  clientReduce,
  closeReasonOf,
  initialClientState,
  onDisconnected,
} from './client-reducer'
import { type ServerClock, createServerClock } from './server-clock'
import type { RoomTransport, RoomTransportFactory } from './transport'
import type {
  AckResult,
  CloseReason,
  ConnectionState,
  RoomSession,
  RoomSessionActions,
  SessionTransition,
} from './types'
import { createWsTransport } from './ws-transport'

export const ACK_TIMEOUT_MS = 10_000
/**
 * An open socket with no `welcome` after this long is dropped and replaced (the server's own
 * hello timeout is the same 10 s). Liveness alone cannot catch it: `pong`s keep arriving.
 */
export const WELCOME_TIMEOUT_MS = 10_000
/** Socket closes before the first welcome after which the overlay shows `error`. */
export const MAX_FAILURES_BEFORE_WELCOME = 3
/** sessionStorage key prefix for `{ epoch, lastSeq }` per room. */
export const SEQ_STORAGE_PREFIX = 'pd_room_seq:'
/** sessionStorage flag guarding the one-time reload on `upgrade-required`. */
export const UPGRADE_RELOAD_KEY = 'pd_upgrade_reloaded'

const disconnected = (): Promise<AckResult> =>
  Promise.resolve({ ok: false, reason: 'disconnected' })

/** A static, disconnected session (for tests, stories and pre-mount renders). */
export function createDisconnectedSession(): RoomSession {
  return {
    selfId: null,
    connection: 'connecting',
    closeReason: null,
    presence: [],
    roomStatus: null,
    rule: { ...DEFAULT_RULE },
    game: null,
    version: 0,
    clock: createTurnClock(null),
    subscribe: () => () => undefined,
    actions: {
      setReady: disconnected,
      unsetReady: disconnected,
      changeRule: disconnected,
      startGame: disconnected,
      draw: disconnected,
      pass: disconnected,
      submit: disconnected,
      leave: () => Promise.resolve(),
      reconnect: () => undefined,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Browser seams (each wrapped in try/catch)                            */
/* ------------------------------------------------------------------ */

export type KeyValueStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LocationLike = {
  pathname: string
  assign(url: string): void
  reload(): void
}

function safeGet(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSet(storage: KeyValueStorage | null, key: string, value: string | null): void {
  try {
    if (value === null) {
      storage?.removeItem(key)
    } else {
      storage?.setItem(key, value)
    }
  } catch {
    // storage blocked: in-memory state still works for this page load
  }
}

function defaultSessionStorage(): KeyValueStorage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function readNameCookie(): string {
  try {
    return Cookies.get('name') ?? ''
  } catch {
    return ''
  }
}

function readResume(
  storage: KeyValueStorage | null,
  roomId: string,
): { epoch: string; lastSeq: number } | null {
  const raw = safeGet(storage, SEQ_STORAGE_PREFIX + roomId)
  if (raw === null) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { epoch?: unknown; lastSeq?: unknown }
    if (
      typeof parsed.epoch === 'string' &&
      typeof parsed.lastSeq === 'number' &&
      Number.isInteger(parsed.lastSeq) &&
      parsed.lastSeq >= 0
    ) {
      return { epoch: parsed.epoch, lastSeq: parsed.lastSeq }
    }
  } catch {
    // corrupt entry: start without resume
  }
  return null
}

const CODE_TO_BYE: Record<number, ByeReason> = Object.fromEntries(
  Object.entries(CLOSE).map(([reason, code]) => [code, reason as ByeReason]),
)

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */

export type RoomSessionControllerOptions = {
  roomId: string
  /** WebSocket URL of the room, or null when no backend is configured (→ `error`) */
  url: string | null
  transportFactory: RoomTransportFactory
  getSid?: () => string
  getName?: () => string
  storage?: KeyValueStorage | null
  location?: LocationLike | null
  ackTimeoutMs?: number
  welcomeTimeoutMs?: number
  /** local clock for the server clock (defaults to Date.now) */
  now?: () => number
}

type Pending = { resolve: (r: AckResult) => void; timer: ReturnType<typeof setTimeout> }

type Snapshot = Omit<RoomSession, 'clock' | 'subscribe' | 'actions'>

export class RoomSessionController {
  readonly clock: TurnClock
  private readonly opts: RoomSessionControllerOptions
  private readonly storage: KeyValueStorage | null
  private readonly serverClock: ServerClock
  private readonly cmdPrefix = `${randomId(4)}-`
  private cmdCounter = 0

  private cs: ClientState
  private connection: ConnectionState
  private closeReason: CloseReason = null
  private transport: RoomTransport | null = null
  private readonly pending = new Map<string, Pending>()
  private everWelcomed = false
  private failuresBeforeWelcome = 0
  private terminalHandled = false
  private leaving: (() => void) | null = null
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null
  /** the reload resume (`lastSeq - 1`) was already asked for once */
  private resumeStepped = false

  private readonly transitionListeners = new Set<(t: SessionTransition) => void>()
  private readonly storeListeners = new Set<() => void>()
  private session: RoomSession

  constructor(opts: RoomSessionControllerOptions) {
    this.opts = opts
    this.storage = opts.storage !== undefined ? opts.storage : defaultSessionStorage()
    this.clock = createTurnClock(null)
    this.serverClock = createServerClock(this.clock, opts.now ? { now: opts.now } : {})
    this.cs = initialClientState(readResume(this.storage, opts.roomId))
    this.connection = opts.url === null ? 'error' : 'connecting'
    this.session = this.build()
  }

  /* ---------------- store ---------------- */

  readonly getSnapshot = (): RoomSession => this.session

  readonly subscribeStore = (listener: () => void): (() => void) => {
    this.storeListeners.add(listener)
    return () => {
      this.storeListeners.delete(listener)
    }
  }

  private snapshot(): Snapshot {
    const view = this.cs.view
    return {
      selfId: this.cs.selfId,
      connection: this.connection,
      closeReason: this.closeReason,
      presence: view ? viewToPresence(view) : [],
      roomStatus: view?.status ?? null,
      rule: view ? { ...view.rule } : { ...DEFAULT_RULE },
      game: this.cs.game,
      version: view?.version ?? 0,
    }
  }

  private build(): RoomSession {
    return {
      ...this.snapshot(),
      clock: this.clock,
      subscribe: this.subscribe,
      actions: this.actions,
    }
  }

  private emit(): void {
    this.session = this.build()
    for (const l of this.storeListeners) {
      l()
    }
  }

  private readonly subscribe = (listener: (t: SessionTransition) => void): (() => void) => {
    this.transitionListeners.add(listener)
    return () => {
      this.transitionListeners.delete(listener)
    }
  }

  /* ---------------- lifecycle ---------------- */

  start(): void {
    if (this.opts.url === null || this.transport !== null) {
      return
    }
    this.openTransport(this.opts.url)
  }

  dispose(): void {
    const transport = this.transport
    this.transport = null
    transport?.close(1000)
    this.failPending('disconnected')
    this.serverClock.dispose()
    this.clearWelcomeTimer()
    this.finishLeave()
  }

  private openTransport(url: string): void {
    let transport = this.transport
    if (transport === null) {
      transport = this.opts.transportFactory()
      this.transport = transport
      transport.onOpen = () => this.handleOpen()
      transport.onMessage = (text) => this.handleMessage(text)
      transport.onClose = (code, reconnecting) => this.handleClose(code, reconnecting)
      transport.onError = () => undefined
    }
    this.terminalHandled = false
    transport.connect(url)
  }

  /* ---------------- transport events ---------------- */

  private handleOpen(): void {
    this.cs = onDisconnected(this.cs)
    this.connection = 'waiting-sync'
    this.transport?.send(JSON.stringify(this.hello()))
    this.armWelcomeTimer()
    this.emit()
  }

  private armWelcomeTimer(): void {
    this.clearWelcomeTimer()
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null
      // The transport reports the dropped socket through `handleClose`, which counts it
      // toward `failuresBeforeWelcome`.
      this.transport?.reconnectNow()
    }, this.opts.welcomeTimeoutMs ?? WELCOME_TIMEOUT_MS)
  }

  private clearWelcomeTimer(): void {
    if (this.welcomeTimer !== null) {
      clearTimeout(this.welcomeTimer)
      this.welcomeTimer = null
    }
  }

  private hello(): Hello {
    const { view, lastSeq, epoch } = this.cs
    // With no board in memory (a reload), ask for one event more than we saw: the replay then
    // always carries at least one full view, where `current` would leave the page empty.
    // Only once: if that replay is cut off before its events arrive, asking for the same seq
    // again still yields at least one event, while stepping down again would walk to zero.
    let seq: number | null = lastSeq
    if (view === null && !this.resumeStepped) {
      this.resumeStepped = true
      seq = lastSeq !== null && lastSeq >= 1 ? lastSeq - 1 : null
      // keep the reducer in step, or it would drop that event as a duplicate
      this.cs = { ...this.cs, lastSeq: seq, epoch: seq === null ? null : epoch }
    }
    return {
      t: 'hello',
      pv: PV,
      sid: (this.opts.getSid ?? getOrCreateSid)(),
      name: (this.opts.getName ?? readNameCookie)(),
      lastSeq: seq,
      epoch: seq === null ? null : epoch,
    }
  }

  private handleMessage(text: string): void {
    const parsed = parseServerFrame(text)
    if (!parsed.ok || parsed.frame.t === 'lobby') {
      return
    }
    const frame = parsed.frame
    if (frame.t === 'welcome' || frame.t === 'evt') {
      this.serverClock.sample(frame.serverNow)
    }
    const result = clientReduce(this.cs, frame)
    this.cs = result.state

    if (frame.t === 'welcome') {
      this.clearWelcomeTimer()
      this.everWelcomed = true
      this.failuresBeforeWelcome = 0
      this.connection = 'open'
      this.closeReason = null
      safeSet(this.storage, UPGRADE_RELOAD_KEY, null)
    }
    for (const ack of result.acks) {
      this.resolveAck(ack.id, ack.ok ? { ok: true } : { ok: false, reason: ack.reason })
    }
    if (frame.t === 'bye') {
      this.handleTerminal(frame.reason)
    }
    this.persistSeq()
    this.serverClock.setDeadline(this.cs.game?.ctx.deadline ?? null)
    for (const t of result.transitions) {
      for (const l of this.transitionListeners) {
        l(t)
      }
    }
    this.emit()

    if (
      frame.t === 'welcome' &&
      this.cs.view === null &&
      this.cs.catchUpTo === null &&
      this.opts.url !== null
    ) {
      // `current` (or an untrusted epoch) with nothing in memory: reconnect and ask for a
      // snapshot. A `replay` sets `catchUpTo` and its events, already on the way, bring the view.
      this.openTransport(this.opts.url)
    }
  }

  private handleClose(code: number, reconnecting: boolean): void {
    this.clearWelcomeTimer()
    this.failPending('disconnected')
    this.cs = onDisconnected(this.cs)
    if (reconnecting) {
      if (!this.everWelcomed) {
        this.failuresBeforeWelcome += 1
      }
      this.connection =
        this.failuresBeforeWelcome >= MAX_FAILURES_BEFORE_WELCOME ? 'error' : 'connecting'
    } else {
      this.handleTerminal(this.cs.bye ?? CODE_TO_BYE[code] ?? 'protocol')
    }
    this.emit()
  }

  private handleTerminal(reason: ByeReason): void {
    this.closeReason = closeReasonOf(reason)
    this.connection = reason === 'protocol' ? 'error' : 'closed'
    if (this.terminalHandled) {
      return
    }
    this.terminalHandled = true
    const location = this.location()
    if (reason === 'bad-name') {
      location?.assign(`/login?callback=${encodeURIComponent(location.pathname)}`)
    } else if (reason === 'upgrade-required') {
      if (safeGet(this.storage, UPGRADE_RELOAD_KEY) === null) {
        safeSet(this.storage, UPGRADE_RELOAD_KEY, '1')
        location?.reload()
      }
    } else if (reason === 'left') {
      this.finishLeave()
    }
  }

  private location(): LocationLike | null {
    if (this.opts.location !== undefined) {
      return this.opts.location
    }
    return (globalThis.location as LocationLike | undefined) ?? null
  }

  private persistSeq(): void {
    const { epoch, lastSeq } = this.cs
    if (epoch !== null && lastSeq !== null) {
      safeSet(
        this.storage,
        SEQ_STORAGE_PREFIX + this.opts.roomId,
        JSON.stringify({ epoch, lastSeq }),
      )
    }
  }

  /* ---------------- commands ---------------- */

  private sendCmd(c: Cmd): Promise<AckResult> {
    const transport = this.transport
    if (transport === null || this.connection !== 'open') {
      return disconnected()
    }
    this.cmdCounter += 1
    const id = `${this.cmdPrefix}${this.cmdCounter}`
    const frame: CmdFrame = { t: 'cmd', id, c }
    if (!transport.send(JSON.stringify(frame))) {
      return disconnected()
    }
    return new Promise<AckResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false, reason: 'timeout' })
      }, this.opts.ackTimeoutMs ?? ACK_TIMEOUT_MS)
      this.pending.set(id, { resolve, timer })
    })
  }

  private resolveAck(id: string, result: AckResult): void {
    const pending = this.pending.get(id)
    if (pending) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.resolve(result)
    }
  }

  private failPending(reason: 'disconnected'): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, reason })
    }
  }

  private turnCmd(build: (turn: number) => Cmd): Promise<AckResult> {
    const game = this.cs.view?.game
    if (!game) {
      return Promise.resolve({ ok: false, reason: 'bad-status' })
    }
    return this.sendCmd(build(game.turn))
  }

  private finishLeave(): void {
    const done = this.leaving
    this.leaving = null
    done?.()
  }

  private leave(): Promise<void> {
    const transport = this.transport
    if (transport === null) {
      return Promise.resolve()
    }
    const closeForGood = () => {
      if (this.transport === transport) {
        this.transport = null
        transport.close(1000)
      }
      this.failPending('disconnected')
      this.connection = 'closed'
      this.closeReason = 'left'
      this.emit()
    }
    if (this.connection !== 'open') {
      closeForGood()
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.leaving = () => {
        closeForGood()
        resolve()
      }
      this.sendCmd({ type: 'leave' }).then(() => this.finishLeave())
    })
  }

  private reconnect(): void {
    const url = this.opts.url
    if (url === null) {
      return
    }
    this.cs = { ...onDisconnected(this.cs), bye: null, closeReason: null }
    this.closeReason = null
    this.failuresBeforeWelcome = 0
    this.connection = 'connecting'
    this.openTransport(url)
    this.emit()
  }

  readonly actions: RoomSessionActions = {
    setReady: () => this.sendCmd({ type: 'ready' }),
    unsetReady: () => this.sendCmd({ type: 'unready' }),
    changeRule: (rule) => this.sendCmd({ type: 'set-rule', rule }),
    startGame: () => this.sendCmd({ type: 'start', expectedVersion: this.cs.view?.version ?? 0 }),
    draw: () => this.turnCmd((turn) => ({ type: 'draw', turn })),
    pass: () => this.turnCmd((turn) => ({ type: 'pass', turn })),
    submit: (set) =>
      this.turnCmd((turn) => ({
        type: 'submit',
        turn,
        submit: [...set.submit],
        factor: [...set.factor],
      })),
    leave: () => this.leave(),
    reconnect: () => this.reconnect(),
  }
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/** Provides a transport factory to every `useRoomSession` below it (tests, stories). */
export const RoomTransportContext = createContext<RoomTransportFactory | null>(null)

export type UseRoomSessionOptions = {
  /** overrides the context and the production WebSocket transport */
  transportFactory?: RoomTransportFactory
  /** backend base URL (http/https); defaults to `REALTIME_URL` */
  realtimeUrl?: string | null
}

export function useRoomSession(roomId: string, options: UseRoomSessionOptions = {}): RoomSession {
  const contextFactory = useContext(RoomTransportContext)
  const factoryRef = useRef<RoomTransportFactory>(createWsTransport)
  factoryRef.current = options.transportFactory ?? contextFactory ?? createWsTransport
  const base = options.realtimeUrl !== undefined ? options.realtimeUrl : REALTIME_URL

  const controller = useMemo(
    () =>
      new RoomSessionController({
        roomId,
        url: wsUrl(`/rooms/${encodeURIComponent(roomId)}/ws`, base),
        transportFactory: () => factoryRef.current(),
      }),
    [roomId, base],
  )

  useEffect(() => {
    controller.start()
    return () => controller.dispose()
  }, [controller])

  return useSyncExternalStore(
    controller.subscribeStore,
    controller.getSnapshot,
    controller.getSnapshot,
  )
}
