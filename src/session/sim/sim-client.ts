/**
 * Simulated browser tab (spec §12.1). It owns a reconnecting socket (backoff, terminal close
 * codes, liveness, resume triggers — spec §3.4) and a pluggable client model that applies frames
 * by the seq/epoch rules of §6.4. The default `minimalClientModel` is a few lines; integration
 * swaps in the real `clientReduce` through the `ClientModel` interface.
 */
import type { Rng } from '../../game/types'
import { CLOSE, PV, TERMINAL_CLOSE_CODES } from '../../shared/ids'
import type { Cmd, RoomServerFrame, View } from '../../shared/protocol'
import type { SimClock, TimerHandle } from './sim-clock'
import type { SimCmdFrame, SimHello } from './sim-host'
import type { ClientEnd, SimConn, SimNetwork } from './sim-network'

/** A client-side model of the room, driven only by server frames. */
export interface ClientModel<S> {
  init(): S
  apply(state: S, frame: RoomServerFrame): S
  lastSeq(state: S): number | null
  epoch(state: S): string | null
  view(state: S): View | null
}

export type MinimalClientState = {
  epoch: string | null
  lastSeq: number | null
  view: View | null
  /** events applied in order (would animate) */
  applied: number
  /** snapshots applied: welcome snapshots and seq gaps */
  snapshots: number
  /** duplicates ignored */
  duplicates: number
  welcomes: { mode: string; seq: number }[]
}

/** The §6.4 client rule, minimal. */
export const minimalClientModel: ClientModel<MinimalClientState> = {
  init: () => ({
    epoch: null,
    lastSeq: null,
    view: null,
    applied: 0,
    snapshots: 0,
    duplicates: 0,
    welcomes: [],
  }),
  apply(s, frame) {
    switch (frame.t) {
      case 'welcome': {
        const welcomes = [...s.welcomes, { mode: frame.mode, seq: frame.seq }]
        if (frame.mode === 'snapshot') {
          return {
            ...s,
            welcomes,
            epoch: frame.epoch,
            lastSeq: frame.seq,
            view: frame.snap ?? null,
            snapshots: s.snapshots + 1,
          }
        }
        return { ...s, welcomes, epoch: frame.epoch }
      }
      case 'evt': {
        if (s.lastSeq !== null && frame.seq <= s.lastSeq) {
          return { ...s, duplicates: s.duplicates + 1 }
        }
        const inOrder = s.lastSeq !== null && frame.seq === s.lastSeq + 1
        return {
          ...s,
          lastSeq: frame.seq,
          view: frame.snap,
          applied: s.applied + (inOrder ? 1 : 0),
          snapshots: s.snapshots + (inOrder ? 0 : 1),
        }
      }
      default:
        return s
    }
  },
  lastSeq: (s) => s.lastSeq,
  epoch: (s) => s.epoch,
  view: (s) => s.view,
}

/** Reconnect backoff (spec §3.4): 0.5, 1, 2, 4, 8, then 10 s, with ±30 % jitter. */
export const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 10_000]
/** A resume trigger reconnects at once if nothing arrived for this long (spec §3.4). */
export const RESUME_QUIET_MS = 25_000

const CLOSE_REASON: Record<number, string> = Object.fromEntries(
  Object.entries(CLOSE).map(([reason, code]) => [code, reason]),
)

export type SimClientOptions<S> = {
  clock: SimClock
  network: SimNetwork
  rng: Rng
  pid: string
  name: string
  model?: ClientModel<S>
}

export class SimClient<S = MinimalClientState> implements ClientEnd {
  readonly pid: string
  name: string
  online = true
  awake = true
  conn: SimConn | null = null
  /** the current socket received its welcome */
  welcomed = false
  /** set by a terminal close (superseded, left, room-full, ...) */
  terminal: string | null = null
  model: S
  readonly acks = new Map<string, { ok: boolean; reason?: string; seq?: number }>()
  readonly frames: RoomServerFrame[] = []
  private attempt = 0
  private retry: TimerHandle | null = null
  private cmdNo = 0
  /** frames that arrived while asleep, processed on wake */
  private buffered: { conn: SimConn; text: string }[] = []
  readonly impl: ClientModel<S>
  private readonly opts: SimClientOptions<S>

  constructor(opts: SimClientOptions<S>) {
    this.opts = opts
    this.pid = opts.pid
    this.name = opts.name
    this.impl = (opts.model ?? minimalClientModel) as unknown as ClientModel<S>
    this.model = this.impl.init()
  }

  get view(): View | null {
    return this.impl.view(this.model)
  }

  get lastSeq(): number | null {
    return this.impl.lastSeq(this.model)
  }

  /* ---------------------------- socket ---------------------------- */

  connect(): void {
    this.retry?.cancel()
    this.retry = null
    if (this.conn !== null) {
      this.opts.network.clientClose(this.conn)
    }
    this.welcomed = false
    this.conn = this.opts.network.open(this)
  }

  opened(conn: SimConn): void {
    if (conn !== this.conn) {
      this.opts.network.clientClose(conn)
      return
    }
    this.sendHello()
  }

  private sendHello(): void {
    if (this.conn === null) {
      return
    }
    const hello: SimHello = {
      t: 'hello',
      pv: PV,
      pid: this.pid,
      name: this.name,
      lastSeq: this.impl.lastSeq(this.model),
      epoch: this.impl.epoch(this.model),
    }
    this.opts.network.toServer(this.conn, JSON.stringify(hello))
  }

  /** Fault: the same socket sends its hello twice. */
  duplicateHello(): void {
    this.sendHello()
  }

  message(conn: SimConn, text: string): void {
    if (conn !== this.conn) {
      return
    }
    if (!this.awake) {
      this.buffered.push({ conn, text })
      return
    }
    this.handle(text)
  }

  private handle(text: string): void {
    const frame = JSON.parse(text) as RoomServerFrame
    this.frames.push(frame)
    if (frame.t === 'ack') {
      this.acks.set(
        frame.id,
        frame.ok ? { ok: true, seq: frame.seq } : { ok: false, reason: frame.reason },
      )
      return
    }
    if (frame.t === 'bye') {
      this.terminal = frame.reason
      return
    }
    if (frame.t === 'welcome') {
      this.welcomed = true
      this.attempt = 0
    }
    this.model = this.impl.apply(this.model, frame)
  }

  closed(conn: SimConn, code: number): void {
    if (conn !== this.conn) {
      return
    }
    this.conn = null
    this.welcomed = false
    if (TERMINAL_CLOSE_CODES.includes(code)) {
      this.terminal ??= CLOSE_REASON[code] ?? String(code)
      return
    }
    this.scheduleReconnect()
  }

  livenessTimeout(conn: SimConn): void {
    if (conn !== this.conn || !this.awake) {
      return
    }
    this.opts.network.clientClose(conn)
    this.conn = null
    this.welcomed = false
    this.scheduleReconnect(true)
  }

  private scheduleReconnect(immediate = false): void {
    if (this.terminal !== null) {
      return
    }
    this.retry?.cancel()
    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]
    this.attempt += 1
    const jitter = 1 + (this.opts.rng.next() * 0.6 - 0.3)
    const delay = immediate ? 0 : Math.round(base * jitter)
    this.retry = this.opts.clock.after(delay, () => {
      this.retry = null
      if (this.awake && this.online && this.terminal === null && this.conn === null) {
        this.connect()
      }
    })
  }

  /** visibility→visible / online / pageshow: reconnect at once if not open or quiet (spec §3.4). */
  private resumeTrigger(): void {
    if (!this.awake || !this.online || this.terminal !== null) {
      return
    }
    const conn = this.conn
    const now = this.opts.clock.now
    if (conn === null || (conn.silentSince !== null && now - conn.silentSince >= RESUME_QUIET_MS)) {
      this.connect()
    }
  }

  /* ---------------------------- faults ---------------------------- */

  /** Tab goes to the background / phone sleeps: no pings, frames queue up. */
  sleep(opts: { closeSocket?: boolean } = {}): void {
    this.awake = false
    if (this.conn !== null) {
      if (opts.closeSocket) {
        // iOS-style: the OS kills the socket and the server sees the close
        this.opts.network.reset(this.conn)
      } else {
        this.conn.silentSince ??= this.opts.clock.now
      }
    }
  }

  wake(): void {
    if (this.awake) {
      return
    }
    this.awake = true
    const pending = this.buffered
    this.buffered = []
    for (const { conn, text } of pending) {
      if (conn === this.conn) {
        this.handle(text)
      }
    }
    const conn = this.conn
    const now = this.opts.clock.now
    if (
      conn !== null &&
      !conn.dead &&
      conn.silentSince !== null &&
      now - conn.silentSince < RESUME_QUIET_MS
    ) {
      conn.silentSince = null // pings resume in time
    }
    if (this.conn === null && this.retry === null) {
      this.scheduleReconnect(true)
      return
    }
    this.resumeTrigger()
  }

  /** Network down. `reset`: the socket closes on both sides; otherwise it goes half-open. */
  goOffline(mode: 'reset' | 'half-open' = 'reset'): void {
    this.online = false
    if (this.conn !== null) {
      if (mode === 'reset') {
        this.opts.network.reset(this.conn)
      } else {
        this.opts.network.halfOpen(this.conn)
      }
    }
  }

  goOnline(): void {
    if (this.online) {
      return
    }
    this.online = true
    if (this.conn === null && this.retry === null) {
      this.scheduleReconnect(true)
      return
    }
    this.resumeTrigger()
  }

  /** Reload: the page and its memory are gone; a new socket says hello without lastSeq. */
  reload(): void {
    if (this.conn !== null) {
      this.opts.network.clientClose(this.conn)
      this.conn = null
    }
    this.model = this.impl.init()
    this.terminal = null
    this.awake = true
    this.online = true
    this.attempt = 0
    this.connect()
  }

  /** The tab is closed for good: the socket closes and nothing reconnects it. */
  closeTab(): void {
    this.terminal = 'closed'
    this.retry?.cancel()
    this.retry = null
    if (this.conn !== null) {
      this.opts.network.clientClose(this.conn)
      this.conn = null
    }
    this.welcomed = false
  }

  /** 「このタブで再開」 after a supersede: take the seat back. */
  resume(): void {
    this.terminal = null
    this.attempt = 0
    this.connect()
  }

  /* ---------------------------- commands ---------------------------- */

  send(cmd: Cmd): string {
    this.cmdNo += 1
    const id = `${this.pid}-${this.cmdNo}`
    if (this.conn?.clientOpen && this.welcomed) {
      const frame: SimCmdFrame = { t: 'cmd', id, c: cmd }
      this.opts.network.toServer(this.conn, JSON.stringify(frame))
    }
    return id
  }

  /** Can this client act right now (awake, online, socket open and welcomed)? */
  get ready(): boolean {
    return (
      this.awake &&
      this.online &&
      this.terminal === null &&
      this.conn !== null &&
      this.conn.clientOpen &&
      this.welcomed
    )
  }
}
