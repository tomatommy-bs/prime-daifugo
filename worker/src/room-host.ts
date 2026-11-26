/**
 * Pure room host (spec §2.1, §3.3-3.4, §4.2-4.3, §5, §6.4). It loads state, feeds inputs to the
 * room reducer, persists, re-arms the single alarm and sends frames. Written against injected
 * `HostStorage`, `HostSocketRegistry`, `Clock` and `LobbyPort` so it runs in Node tests; only
 * `room-do.ts` binds it to Cloudflare.
 *
 * Ordering per accepted input (spec §4.2): persist the state row and the ring events, then
 * set/delete the alarm if the wake time changed, and only then send frames.
 *
 * No timers: hello timeouts and the liveness sweep are driven by the alarm (spec §2.4).
 */
import { engine as defaultEngine } from '../../src/game/engine'
import type { GameEngine, Rng } from '../../src/game/types'
import { initialRoomState } from '../../src/session/reducer'
import {
  type Directive,
  type InitialRoomState,
  ROOM_STATE_SCHEMA,
  type ReducerResult,
  type RoomConfig,
  type RoomReducer,
  type RoomState,
  type SessionInput,
  type ViewFor,
} from '../../src/session/types'
import { viewFor as defaultViewFor } from '../../src/session/view'
import { PV, type Pid, generateEpoch, isValidSid } from '../../src/shared/ids'
import {
  type Ack,
  BYE_CLOSE_CODE,
  type Bye,
  type ByeReason,
  type ClientFrame,
  type CmdFrame,
  type Evt,
  type Hello,
  PING,
  PONG,
  type View,
  type Welcome,
  parseClientFrame,
} from '../../src/shared/protocol'
import { cryptoRng } from '../../src/shared/rng'
import {
  LOBBY_REPORT_INTERVAL_MS,
  STALE_CLOSE_CODE,
  STALE_SOCKET_MS,
  SWEEP_INTERVAL_MS,
} from './config'
import { derivePid } from './crypto'
import type { RoomInfo } from './http'
import { TokenBucket } from './rate-limit'
import {
  type HostSocket,
  type HostSocketRegistry,
  freshAttachment,
  lastActivityAt,
} from './sockets'
import type { EventRow, HostStorage } from './storage'

export type Clock = { now(): number }

/** Fire-and-forget calls to `LobbyDO` (spec §8.2); the DO wraps them in `ctx.waitUntil`. */
export type LobbyPort = {
  report(roomId: string, count: number, status: string): void
  release(roomId: string): void
}

export type RoomHostDeps = {
  storage: HostStorage
  sockets: HostSocketRegistry
  clock: Clock
  reducer: RoomReducer
  config: RoomConfig
  lobby: LobbyPort
  engine?: GameEngine
  viewFor?: ViewFor
  rng?: Rng
  initialState?: InitialRoomState
  newEpoch?: () => string
  derivePid?: (sid: string) => Promise<Pid>
}

type SocketLocal = {
  bucket: TokenBucket | null
  /** frames received while this socket's hello is being processed (the pid hash is async) */
  pending: (string | ArrayBuffer)[] | null
  /** closed by the host; its close event must not feed another disconnect */
  closed: boolean
}

const connKey = (pid: Pid, connNo: number): string => `${pid}#${connNo}`

/** A hello whose `pv` is outside `{PV, PV-1}`, recognised even if the rest no longer parses. */
function unsupportedHelloVersion(text: string): boolean {
  try {
    const raw = JSON.parse(text) as { t?: unknown; pv?: unknown }
    return raw?.t === 'hello' && typeof raw.pv === 'number' && !isSupportedPv(raw.pv)
  } catch {
    return false
  }
}

function isSupportedPv(pv: number): boolean {
  return pv === PV || pv === PV - 1
}

export class RoomHost {
  private readonly storage: HostStorage
  private readonly sockets: HostSocketRegistry
  private readonly clock: Clock
  private readonly reducer: RoomReducer
  private readonly config: RoomConfig
  private readonly lobby: LobbyPort
  private readonly engine: GameEngine
  private readonly viewFor: ViewFor
  private readonly rng: Rng
  private readonly initialState: InitialRoomState
  private readonly newEpoch: () => string
  private readonly derivePid: (sid: string) => Promise<Pid>

  private state: RoomState | null = null
  /** whether `state` has a stored row (a fresh room is persisted on its first change) */
  private persisted = false
  private reducerWakeAt: number | null = null
  /**
   * When the next sweep alarm is due. In memory only: a hibernated object loses it, so the
   * sweep itself runs on every alarm (it is idempotent) rather than only when this is due.
   */
  private nextSweepAt: number | null = null
  private readonly locals = new WeakMap<HostSocket, SocketLocal>()

  constructor(deps: RoomHostDeps) {
    this.storage = deps.storage
    this.sockets = deps.sockets
    this.clock = deps.clock
    this.reducer = deps.reducer
    this.config = deps.config
    this.lobby = deps.lobby
    this.engine = deps.engine ?? defaultEngine
    this.viewFor = deps.viewFor ?? defaultViewFor
    this.rng = deps.rng ?? cryptoRng()
    this.initialState = deps.initialState ?? initialRoomState
    this.newEpoch = deps.newEpoch ?? generateEpoch
    this.derivePid = deps.derivePid ?? derivePid
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Wake path (spec §4.2): load the state row and reconcile it with the sockets that are
   * actually attached (RQ-S19). `roomId` creates a fresh state when nothing usable is stored.
   */
  onLoad(roomId: string | null = null): void {
    const raw = this.storage.loadState() as Partial<RoomState> | null
    if (raw && raw.schema === ROOM_STATE_SCHEMA) {
      this.state = raw as RoomState
      this.persisted = true
    } else {
      if (raw) {
        // Unknown schema (spec §11.4): start a fresh room.
        this.storage.deleteAll()
      }
      this.state = null
      this.persisted = false
      if (roomId) {
        this.ensureRoom(roomId)
      }
    }
    if (this.state) {
      this.apply({ type: 'reconcile', live: this.liveConns() })
    }
    this.syncAlarm(this.clock.now())
  }

  /** Make sure an (unpersisted) state exists for `roomId` before accepting a socket. */
  ensureRoom(roomId: string): void {
    if (!this.state) {
      this.state = this.initialState(roomId, this.newEpoch(), this.config)
      this.persisted = false
    }
  }

  /** A socket was accepted. It must send `hello` within `helloTimeoutMs` (spec §3.3). */
  onOpen(socket: HostSocket): void {
    const now = this.clock.now()
    socket.setAttachment(freshAttachment(now))
    this.syncAlarm(now)
  }

  /** `webSocketMessage`. */
  async onMessage(socket: HostSocket, data: string | ArrayBuffer): Promise<void> {
    const local = this.local(socket)
    if (local.closed) {
      return
    }
    if (local.pending) {
      local.pending.push(data)
      return
    }
    const now = this.clock.now()
    socket.setAttachment({ ...socket.attachment, lastMessageAt: now })
    if (typeof data !== 'string') {
      this.protocolViolation(socket)
      return
    }
    if (data === PING) {
      // Normally answered by the runtime's auto-response without waking us.
      socket.send(PONG)
      return
    }
    const parsed = parseClientFrame(data)
    if (!parsed.ok) {
      if (parsed.error === 'schema' && unsupportedHelloVersion(data)) {
        this.closeSocket(socket, 'upgrade-required')
      } else {
        this.protocolViolation(socket)
      }
      return
    }
    await this.onFrame(socket, parsed.frame)
  }

  /** `webSocketClose` / `webSocketError` (spec §3.4). */
  onClose(socket: HostSocket): void {
    const local = this.local(socket)
    if (!local.closed) {
      local.closed = true
      const { pid, connNo } = socket.attachment
      if (pid !== null) {
        this.apply({ type: 'disconnect', pid, connNo })
      }
    }
    this.syncAlarm(this.clock.now())
  }

  /**
   * `alarm()`: tick the reducer, expire silent pre-hello sockets, sweep, re-arm (spec §5).
   *
   * The sweep runs on every alarm. Each wake from hibernation builds a new host whose in-memory
   * sweep deadline is already pushed a full interval ahead by `onLoad`, so gating the sweep on
   * that deadline would skip it forever in a room that only receives auto-answered pings.
   */
  onAlarm(): void {
    this.storage.alarmFired()
    const now = this.clock.now()
    if (this.state) {
      this.apply({ type: 'tick' })
    }
    this.expireHellos(now)
    this.sweep(now)
    this.syncAlarm(now)
  }

  /** RPC `info()` for `GET /rooms/:id` (spec §8.1). */
  info(): RoomInfo {
    const capacity = this.config.maxSeats + this.config.maxObservers
    const s = this.state
    if (!s || !this.persisted) {
      return { exists: false, status: null, members: 0, connected: 0, capacity }
    }
    const members = Object.values(s.members)
    return {
      exists: true,
      status: s.status,
      members: members.length,
      connected: members.filter((m) => m.connected && m.bot === undefined).length,
      capacity,
    }
  }

  /** Current state (tests and diagnostics). */
  get current(): RoomState | null {
    return this.state
  }

  /* ---------------------------------------------------------------- */
  /* Frames                                                            */
  /* ---------------------------------------------------------------- */

  private async onFrame(socket: HostSocket, frame: ClientFrame): Promise<void> {
    if (frame.t === 'hello') {
      if (socket.attachment.pid !== null) {
        // a second hello on a bound socket
        this.protocolViolation(socket)
        return
      }
      await this.onHello(socket, frame)
      return
    }
    if (socket.attachment.pid === null) {
      // a command before hello (spec §6.4)
      this.protocolViolation(socket)
      return
    }
    this.onCommand(socket, frame)
  }

  private async onHello(socket: HostSocket, hello: Hello): Promise<void> {
    if (!isSupportedPv(hello.pv)) {
      this.closeSocket(socket, 'upgrade-required')
      return
    }
    if (!isValidSid(hello.sid)) {
      this.protocolViolation(socket)
      return
    }
    const local = this.local(socket)
    local.pending = []
    let pid: Pid
    try {
      // The only await before the reducer (spec §4.3).
      pid = await this.derivePid(hello.sid)
    } catch {
      local.pending = null
      this.protocolViolation(socket)
      return
    }
    const queued = local.pending
    local.pending = null
    if (local.closed) {
      return
    }
    const state = this.state
    if (!state) {
      this.closeSocket(socket, 'room-gone')
      return
    }
    // Re-read the in-memory state after the await, then run the reducer synchronously.
    const connNo = (state.members[pid]?.connNo ?? 0) + 1
    socket.setAttachment({ ...socket.attachment, pid, connNo, name: hello.name })
    this.apply({
      type: 'connect',
      pid,
      name: hello.name,
      connNo,
      lastSeq: hello.lastSeq,
      epoch: hello.epoch,
    })
    for (const data of queued) {
      await this.onMessage(socket, data)
    }
  }

  private onCommand(socket: HostSocket, frame: CmdFrame): void {
    const { pid, connNo } = socket.attachment
    if (pid === null) {
      return
    }
    const local = this.local(socket)
    const now = this.clock.now()
    local.bucket ??= new TokenBucket(now)
    if (!local.bucket.take(now)) {
      const ack: Ack = { t: 'ack', id: frame.id, ok: false, reason: 'rate-limited' }
      socket.send(JSON.stringify(ack))
      return
    }
    this.apply({ type: 'command', pid, connNo, id: frame.id, cmd: frame.c })
  }

  /* ---------------------------------------------------------------- */
  /* Reducer → persist → alarm → send                                  */
  /* ---------------------------------------------------------------- */

  private apply(input: SessionInput): void {
    const before = this.state
    if (!before) {
      return
    }
    const now = this.clock.now()
    const result = this.reducer(before, input, {
      now,
      rng: this.rng,
      engine: this.engine,
      config: this.config,
    })
    const destroying = result.directives.some((d) => d.type === 'destroy')

    // The lobby bookkeeping lives in the state row, so it survives hibernation and restarts
    // and a report is only sent when the count actually changed (spec §8.2).
    let state = result.state
    const report = !destroying && result.lobbyCount !== state.lastReportedCount
    if (report) {
      state = { ...state, lastReportedCount: result.lobbyCount, lastReportAt: now }
    }

    // 1-2. Persist the state row and the ring events (one transaction).
    if (!destroying && state !== before) {
      this.persist(state, result)
    }
    this.state = state
    this.reducerWakeAt = result.wakeAt

    // 3. Re-arm the alarm before anything is sent.
    if (!destroying) {
      this.syncAlarm(now)
    }

    // 4. Send: events first, then directives in order.
    this.broadcast(result, now)
    for (const directive of result.directives) {
      this.runDirective(directive, result.state, now)
    }

    if (destroying) {
      this.destroy(result.state.roomId)
    } else if (report) {
      this.lobby.report(state.roomId, state.lastReportedCount, state.status)
    }
    // Directives may have closed sockets, which changes the sweep and hello deadlines.
    this.syncAlarm(now)
  }

  private persist(s: RoomState, result: ReducerResult | null): void {
    const rows: EventRow[] = (result?.events ?? []).map((ev) => ({
      seq: ev.seq,
      e: ev.e,
      state: result?.state ?? s,
    }))
    const ringFloor = Math.max(1, s.ringFloor, s.version - this.config.ringSize + 1)
    this.storage.persist(s, rows, ringFloor)
    this.persisted = true
  }

  private broadcast(result: ReducerResult, now: number): void {
    if (result.events.length === 0) {
      return
    }
    const state = result.state
    const welcomed = new Set<string>()
    for (const d of result.directives) {
      if (d.type === 'welcome') {
        welcomed.add(connKey(d.pid, d.connNo))
      }
    }
    const targets = this.liveSockets().filter((s) => {
      const { pid, connNo } = s.attachment
      if (pid === null || welcomed.has(connKey(pid, connNo))) {
        return false
      }
      const member = state.members[pid]
      return member?.connected === true && member.connNo === connNo
    })
    const views = new Map<Pid, View>()
    for (const socket of targets) {
      const pid = socket.attachment.pid as Pid
      let snap = views.get(pid)
      if (!snap) {
        snap = this.viewFor(state, pid)
        views.set(pid, snap)
      }
      for (const ev of result.events) {
        const frame: Evt = { t: 'evt', seq: ev.seq, serverNow: now, e: ev.e, snap }
        socket.send(JSON.stringify(frame))
      }
    }
  }

  private runDirective(d: Directive, state: RoomState, now: number): void {
    switch (d.type) {
      case 'welcome': {
        const socket = this.findSocket(d.pid, d.connNo)
        if (socket) {
          this.sendWelcome(socket, d, state, now)
        }
        return
      }
      case 'ack': {
        const socket = this.findSocket(d.pid, d.connNo)
        const ack: Ack = d.result.ok
          ? { t: 'ack', id: d.id, ok: true, seq: d.result.seq }
          : { t: 'ack', id: d.id, ok: false, reason: d.result.reason }
        socket?.send(JSON.stringify(ack))
        return
      }
      case 'bye': {
        const socket = this.findSocket(d.pid, d.connNo)
        if (socket) {
          this.closeSocket(socket, d.reason, d.code)
        }
        return
      }
      case 'close': {
        for (const socket of this.liveSockets()) {
          this.closeSocket(socket, d.reason, d.code)
        }
        return
      }
      default:
        // 'destroy' is handled after the directives (spec §4.2 GC)
        return
    }
  }

  private sendWelcome(
    socket: HostSocket,
    d: Extract<Directive, { type: 'welcome' }>,
    state: RoomState,
    now: number,
  ): void {
    let mode = d.mode
    let rows: EventRow[] = []
    if (mode === 'replay') {
      rows = this.storage.readEvents(d.fromSeq).filter((r) => r.seq <= state.version)
      const contiguous =
        rows.length === state.version - d.fromSeq + 1 &&
        rows.every((r, i) => r.seq === d.fromSeq + i)
      if (!contiguous) {
        // The ring no longer covers the gap: fall back to a snapshot.
        mode = 'snapshot'
        rows = []
      }
    }
    const welcome: Welcome = {
      t: 'welcome',
      pv: PV,
      selfId: d.pid,
      epoch: state.epoch,
      serverNow: now,
      mode,
      seq: state.version,
      ...(mode === 'snapshot' ? { snap: this.viewFor(state, d.pid) } : {}),
    }
    socket.send(JSON.stringify(welcome))
    for (const row of rows) {
      const evt: Evt = {
        t: 'evt',
        seq: row.seq,
        serverNow: now,
        e: row.e,
        snap: this.viewFor(row.state, d.pid),
      }
      socket.send(JSON.stringify(evt))
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sockets                                                           */
  /* ---------------------------------------------------------------- */

  private local(socket: HostSocket): SocketLocal {
    let local = this.locals.get(socket)
    if (!local) {
      local = { bucket: null, pending: null, closed: false }
      this.locals.set(socket, local)
    }
    return local
  }

  private liveSockets(): HostSocket[] {
    return this.sockets.all().filter((s) => !this.local(s).closed)
  }

  private liveConns(): { pid: Pid; connNo: number }[] {
    const out: { pid: Pid; connNo: number }[] = []
    for (const s of this.liveSockets()) {
      const { pid, connNo } = s.attachment
      if (pid !== null) {
        out.push({ pid, connNo })
      }
    }
    return out
  }

  private findSocket(pid: Pid, connNo: number): HostSocket | undefined {
    return this.liveSockets().find(
      (s) => s.attachment.pid === pid && s.attachment.connNo === connNo,
    )
  }

  /** Send `bye{reason}` and close with its code (spec §6.2). */
  private closeSocket(socket: HostSocket, reason: ByeReason, code = BYE_CLOSE_CODE[reason]): void {
    const local = this.local(socket)
    if (local.closed) {
      return
    }
    local.closed = true
    const bye: Bye = { t: 'bye', reason }
    socket.send(JSON.stringify(bye))
    socket.close(code, reason)
  }

  /** `bye{protocol}` + 4004; a bound socket's member is then marked disconnected. */
  private protocolViolation(socket: HostSocket): void {
    const wasClosed = this.local(socket).closed
    this.closeSocket(socket, 'protocol')
    const { pid, connNo } = socket.attachment
    if (!wasClosed && pid !== null) {
      this.apply({ type: 'disconnect', pid, connNo })
    }
    this.syncAlarm(this.clock.now())
  }

  private expireHellos(now: number): void {
    for (const socket of this.liveSockets()) {
      const local = this.local(socket)
      if (
        socket.attachment.pid === null &&
        local.pending === null &&
        socket.attachment.acceptedAt + this.config.helloTimeoutMs <= now
      ) {
        this.closeSocket(socket, 'protocol')
      }
    }
  }

  /** Close half-open sockets and feed their disconnects; keep the lobby row fresh (spec §3.4). */
  private sweep(now: number): void {
    this.nextSweepAt = null
    for (const socket of this.liveSockets()) {
      const { pid, connNo } = socket.attachment
      if (pid === null || now - lastActivityAt(socket) <= STALE_SOCKET_MS) {
        continue
      }
      this.local(socket).closed = true
      socket.close(STALE_CLOSE_CODE, 'stale')
      this.apply({ type: 'disconnect', pid, connNo })
    }
    const state = this.state
    if (
      state &&
      this.persisted &&
      state.lastReportedCount > 0 &&
      now - state.lastReportAt >= LOBBY_REPORT_INTERVAL_MS
    ) {
      this.state = { ...state, lastReportAt: now }
      this.persist(this.state, null)
      this.lobby.report(state.roomId, state.lastReportedCount, state.status)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Alarm, lobby, GC                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * `wakeAt = min(reducer wakeAt, sweepAt, pre-hello deadlines)` (spec §5). The alarm is only
   * written when the value differs from the current one.
   */
  private syncAlarm(now: number): void {
    const live = this.liveSockets()
    if (live.length === 0) {
      this.nextSweepAt = null
    } else if (this.nextSweepAt === null) {
      this.nextSweepAt = now + SWEEP_INTERVAL_MS
    }
    let wakeAt: number | null = this.reducerWakeAt
    const consider = (t: number | null) => {
      if (t !== null && (wakeAt === null || t < wakeAt)) {
        wakeAt = t
      }
    }
    consider(this.nextSweepAt)
    for (const socket of live) {
      if (socket.attachment.pid === null) {
        consider(socket.attachment.acceptedAt + this.config.helloTimeoutMs)
      }
    }
    const current = this.storage.getAlarm()
    if (wakeAt === null) {
      if (current !== null) {
        this.storage.deleteAlarm()
      }
    } else if (wakeAt !== current) {
      this.storage.setAlarm(wakeAt)
    }
  }

  /** Room GC (spec §4.2): wipe storage, release the lobby row, start over with a new epoch. */
  private destroy(roomId: string): void {
    for (const socket of this.liveSockets()) {
      this.closeSocket(socket, 'room-gone')
    }
    this.storage.deleteAll()
    this.lobby.release(roomId)
    this.reducerWakeAt = null
    this.state = this.initialState(roomId, this.newEpoch(), this.config)
    this.persisted = false
  }
}
