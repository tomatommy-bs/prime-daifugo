/**
 * In-memory host mirroring the Durable Object host semantics (spec §4.2, §5, §12.1):
 * - one input at a time through the reducer; persist (state row + event ring) before sending;
 * - events broadcast to every connected member's current socket, rendered per viewer;
 * - welcome / replay from the ring / ack / bye / close / destroy directives;
 * - one alarm at `min(wakeAt, sweepAt)`; the sweep closes sockets silent for 75 s;
 * - `crashRestart()`: serialize, drop every socket, reload and reconcile (RQ-S19).
 *
 * The reducer and the view are injected so the same harness drives any implementation.
 */
import type { GameEngine, Rng } from '../../game/types'
import { CLOSE, PV } from '../../shared/ids'
import type { Ack, Bye, Cmd, Evt, RoomEvent, RoomServerFrame, Welcome } from '../../shared/protocol'
import { initialRoomState, roomReduce } from '../reducer'
import { computeWakeAt } from '../timers'
import type {
  Pid,
  ReducerResult,
  RoomConfig,
  RoomReducer,
  RoomState,
  SessionInput,
  ViewFor,
} from '../types'
import { viewFor } from '../view'
import type { SimClock } from './sim-clock'
import type { ServerEnd, SimConn, SimNetwork } from './sim-network'

/** Sweep cadence and the silence after which a socket is considered dead (spec §3.4). */
export const SWEEP_INTERVAL_MS = 60_000
export const SWEEP_STALE_MS = 75_000

export type RingEntry = { seq: number; e: RoomEvent; state: RoomState }

/** Observer for every frame the host sends, with the state it was rendered from. */
export type SendObserver = (
  conn: SimConn,
  frame: RoomServerFrame,
  rendered: RoomState | null,
) => void

/** Observer for every reducer step, with the state before it. */
export type StepObserver = (
  prev: RoomState | null,
  input: SessionInput,
  result: ReducerResult,
) => void

export type SimHostOptions = {
  clock: SimClock
  network: SimNetwork
  engine: GameEngine
  config: RoomConfig
  rng: Rng
  roomId?: string
  reducer?: RoomReducer
  view?: ViewFor
  onSend?: SendObserver
  onStep?: StepObserver
}

/** A client hello as parsed by the host (the simulator sends the pid directly; no sid hashing). */
export type SimHello = {
  t: 'hello'
  pv: number
  pid: Pid
  name: string
  lastSeq: number | null
  epoch: string | null
}
export type SimCmdFrame = { t: 'cmd'; id: string; c: Cmd }

export class SimHost implements ServerEnd {
  state: RoomState | null = null
  ring: RingEntry[] = []
  readonly conns = new Set<SimConn>()
  lastResult: ReducerResult | null = null
  private sweepAt: number | null = null
  private epochNo = 0
  restarts = 0
  destroyedCount = 0
  readonly opts: SimHostOptions
  private readonly reducer: RoomReducer
  private readonly view: ViewFor

  constructor(opts: SimHostOptions) {
    this.opts = opts
    this.reducer = opts.reducer ?? roomReduce
    this.view = opts.view ?? viewFor
    opts.network.server = this
    opts.clock.onAlarm(() => this.onAlarm())
  }

  private get clock() {
    return this.opts.clock
  }

  /* ---------------------------- network ---------------------------- */

  accept(conn: SimConn): void {
    this.conns.add(conn)
    this.armAlarm()
  }

  message(conn: SimConn, text: string): void {
    const frame = JSON.parse(text) as SimHello | SimCmdFrame
    if (frame.t === 'hello') {
      if (conn.helloDone) {
        return // a duplicate hello on the same socket changes nothing
      }
      if (frame.pv !== PV && frame.pv !== PV - 1) {
        this.bye(conn, 'upgrade-required', CLOSE['upgrade-required'])
        return
      }
      const state = this.ensureState()
      let max = state.members[frame.pid]?.connNo ?? 0
      for (const c of this.conns) {
        if (c.pid === frame.pid) {
          max = Math.max(max, c.connNo)
        }
      }
      conn.pid = frame.pid
      conn.connNo = max + 1
      conn.helloDone = true
      this.apply({
        type: 'connect',
        pid: frame.pid,
        name: frame.name,
        connNo: conn.connNo,
        lastSeq: frame.lastSeq,
        epoch: frame.epoch,
      })
      return
    }
    if (!conn.helloDone || conn.pid === null || this.state === null) {
      this.bye(conn, 'protocol', CLOSE.protocol)
      return
    }
    this.apply({ type: 'command', pid: conn.pid, connNo: conn.connNo, id: frame.id, cmd: frame.c })
  }

  closed(conn: SimConn): void {
    if (!this.conns.delete(conn)) {
      return
    }
    if (conn.helloDone && conn.pid !== null && this.state !== null) {
      this.apply({ type: 'disconnect', pid: conn.pid, connNo: conn.connNo })
    } else {
      this.armAlarm()
    }
  }

  /* ---------------------------- core loop ---------------------------- */

  private ensureState(): RoomState {
    if (this.state === null) {
      this.epochNo += 1
      this.state = initialRoomState(
        this.opts.roomId ?? 'sim-room',
        `ep${this.epochNo}`,
        this.opts.config,
      )
      this.ring = []
    }
    return this.state
  }

  private persist(state: RoomState): RoomState {
    // storage holds JSON: anything that does not survive a round trip is a bug
    return JSON.parse(JSON.stringify(state)) as RoomState
  }

  /** Run one input through the reducer, persist, send, re-arm. */
  apply(input: SessionInput): ReducerResult {
    const prev = this.ensureState()
    const result = this.reducer(prev, input, {
      now: this.clock.now,
      rng: this.opts.rng,
      engine: this.opts.engine,
      config: this.opts.config,
    })
    this.lastResult = result
    this.opts.onStep?.(prev, input, result)

    // 1. persist the state row and the ring (before anything is sent)
    if (result.state !== prev) {
      this.state = this.persist(result.state)
    }
    const stored = this.state as RoomState
    for (const { seq, e } of result.events) {
      this.ring.push({ seq, e, state: stored })
    }
    const floor = stored.version - this.opts.config.ringSize + 1
    this.ring = this.ring.filter((r) => r.seq >= floor)

    // 2. broadcast events to connected members' current sockets, except those welcomed now
    const welcomed = new Set(
      result.directives.filter((d) => d.type === 'welcome').map((d) => `${d.pid}\u0000${d.connNo}`),
    )
    for (const { seq, e } of result.events) {
      for (const conn of this.conns) {
        if (!conn.helloDone || conn.pid === null) {
          continue
        }
        const m = stored.members[conn.pid]
        if (
          !m ||
          !m.connected ||
          m.connNo !== conn.connNo ||
          welcomed.has(`${conn.pid}\u0000${conn.connNo}`)
        ) {
          continue
        }
        this.sendEvt(conn, seq, e, stored)
      }
    }

    // 3. directives in order
    let destroyed = false
    for (const d of result.directives) {
      switch (d.type) {
        case 'welcome': {
          const conn = this.find(d.pid, d.connNo)
          if (!conn) {
            break
          }
          const welcome: Welcome = {
            t: 'welcome',
            pv: PV,
            selfId: d.pid,
            epoch: stored.epoch,
            serverNow: this.clock.now,
            mode: d.mode,
            seq: stored.version,
            ...(d.mode === 'snapshot' ? { snap: this.view(stored, d.pid) } : {}),
          }
          this.send(conn, welcome, stored)
          if (d.mode === 'replay') {
            for (const r of this.ring) {
              if (r.seq >= d.fromSeq) {
                this.sendEvt(conn, r.seq, r.e, r.state)
              }
            }
          }
          break
        }
        case 'ack': {
          const conn = this.find(d.pid, d.connNo)
          if (conn) {
            const ack: Ack = d.result.ok
              ? { t: 'ack', id: d.id, ok: true, seq: d.result.seq }
              : { t: 'ack', id: d.id, ok: false, reason: d.result.reason }
            this.send(conn, ack, null)
          }
          break
        }
        case 'bye': {
          const conn = this.find(d.pid, d.connNo)
          if (conn) {
            this.bye(conn, d.reason, d.code)
          }
          break
        }
        case 'close':
          for (const conn of [...this.conns]) {
            this.bye(conn, d.reason, d.code)
          }
          break
        default:
          // 'destroy'
          destroyed = true
          break
      }
    }
    if (destroyed) {
      this.state = null
      this.ring = []
      this.destroyedCount += 1
    }
    this.armAlarm(destroyed ? null : result.wakeAt)
    return result
  }

  private find(pid: Pid, connNo: number): SimConn | undefined {
    for (const conn of this.conns) {
      if (conn.pid === pid && conn.connNo === connNo) {
        return conn
      }
    }
    return undefined
  }

  private sendEvt(conn: SimConn, seq: number, e: RoomEvent, state: RoomState): void {
    const evt: Evt = {
      t: 'evt',
      seq,
      serverNow: this.clock.now,
      e,
      snap: this.view(state, conn.pid as Pid),
    }
    this.send(conn, evt, state)
  }

  private send(conn: SimConn, frame: RoomServerFrame, rendered: RoomState | null): void {
    this.opts.onSend?.(conn, frame, rendered)
    this.opts.network.toClient(conn, JSON.stringify(frame))
  }

  private bye(conn: SimConn, reason: Bye['reason'], code: number): void {
    this.send(conn, { t: 'bye', reason }, null)
    this.conns.delete(conn)
    this.opts.network.serverClose(conn, code)
  }

  /* ---------------------------- timers ---------------------------- */

  private armAlarm(wakeAt: number | null = this.state ? computeWakeAt(this.state) : null): void {
    if (this.conns.size > 0) {
      this.sweepAt ??= this.clock.now + SWEEP_INTERVAL_MS
    } else {
      this.sweepAt = null
    }
    const candidates = [wakeAt, this.sweepAt].filter((t): t is number => t !== null)
    this.clock.setAlarm(candidates.length > 0 ? Math.min(...candidates) : null)
  }

  private onAlarm(): void {
    const now = this.clock.now
    if (this.state !== null) {
      this.apply({ type: 'tick' })
    }
    // Like the Worker host: sweep on every alarm, since a hibernation wake forgets `sweepAt`.
    this.sweepAt = null
    for (const conn of [...this.conns]) {
      if (conn.lastPongAt(now) < now - SWEEP_STALE_MS) {
        this.conns.delete(conn)
        this.opts.network.serverClose(conn, 1001)
        if (conn.helloDone && conn.pid !== null && this.state !== null) {
          this.apply({ type: 'disconnect', pid: conn.pid, connNo: conn.connNo })
        }
      }
    }
    this.armAlarm()
  }

  /* ---------------------------- lifecycle ---------------------------- */

  /** A deploy or eviction that drops every socket (spec §4.2 wake path, RQ-S19). */
  crashRestart(): void {
    this.restarts += 1
    const saved = JSON.stringify({ state: this.state, ring: this.ring })
    for (const conn of this.conns) {
      this.opts.network.dropFromServer(conn)
    }
    this.conns.clear()
    this.sweepAt = null
    this.clock.setAlarm(null)
    const loaded = JSON.parse(saved) as { state: RoomState | null; ring: RingEntry[] }
    this.state = loaded.state
    this.ring = loaded.ring
    if (this.state !== null) {
      this.apply({ type: 'reconcile', live: [] })
    } else {
      this.armAlarm(null)
    }
  }

  /** A hibernation wake: sockets survive, so reconcile must change nothing. */
  hibernateWake(): ReducerResult | null {
    // The in-memory sweep deadline does not survive hibernation (a new host object is built).
    this.sweepAt = null
    if (this.state === null) {
      this.armAlarm()
      return null
    }
    const live = [...this.conns]
      .filter((c) => c.helloDone && c.pid !== null)
      .map((c) => ({ pid: c.pid as Pid, connNo: c.connNo }))
    return this.apply({ type: 'reconcile', live })
  }

  /** Test hook: replace the stored state (e.g. to stage a hand). Persisted like any write. */
  patchState(fn: (draft: RoomState) => void): void {
    const draft = this.persist(this.ensureState())
    fn(draft)
    this.state = this.persist(draft)
    this.armAlarm()
  }

  /** Live (pid, connNo) pairs the host holds. */
  liveConns(): { pid: Pid; connNo: number }[] {
    return [...this.conns]
      .filter((c) => c.helloDone && c.pid !== null)
      .map((c) => ({ pid: c.pid as Pid, connNo: c.connNo }))
  }
}
