/**
 * Session-layer contract (spec §3, §4.1, §5, §6). Frozen: owned by the foundation, implemented
 * by T2 (`reducer.ts`, `view.ts`), driven by the Worker host (T3) and the simulator.
 *
 * `roomReduce(state, input, deps)` is pure and synchronous. It holds every session and timer
 * decision; the host only loads state, runs the reducer, persists, sends and re-arms the alarm.
 */
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type { GameCore, GameEngine, Rng } from '../game/types'
import type { Pid } from '../shared/ids'
import type {
  ByeReason,
  Cmd,
  RejectReason,
  Role,
  RoomEvent,
  RoomStatus,
  View,
  WelcomeMode,
} from '../shared/protocol'

export type { Pid, RoomStatus, Role }

/** Events kept for client replay (spec §4.2). */
export const RING_SIZE = 64

/** State schema version stored with every room (spec §11.4: an unknown schema starts fresh). */
export const ROOM_STATE_SCHEMA = 1

export type Member = {
  name: string
  joinedAt: number
  ready: boolean
  readyAt: number | null
  /** player = holds a seat in the current/last game */
  role: Role
  connected: boolean
  /** increments per accepted hello; identifies the live socket */
  connNo: number
  lastSeen: number
  /** set when connected=false */
  graceUntil: number | null
}

export type GameEndReason = 'empty-hand' | 'last-standing'

export type RoomGame = {
  round: number
  /** engine state (§7): playOrder, currentPlayer, players, deck, field, deckTopPlayer, turn, winner, lastResult */
  core: GameCore
  /** epoch ms; null only when status !== 'playing' */
  deadline: number | null
  endReason: GameEndReason | null
}

/** Persisted room state (spec §4.1). Pure JSON. */
export type RoomState = {
  schema: typeof ROOM_STATE_SCHEMA
  roomId: string
  /** random id created with the state; changes if the room is GC'd and recreated */
  epoch: string
  /** = last event seq */
  version: number
  /** lowest seq still in the event ring */
  ringFloor: number
  status: RoomStatus
  rule: PrimeDaifugoSetupData
  members: Record<Pid, Member>
  game: RoomGame | null
  gcAt: number | null
  /** for lobby reporting */
  lastReportedCount: number
  lastReportAt: number
}

/** Durations and limits (spec §3.5, §5, RQ-S14, RQ-S15). Worker `vars` override the defaults. */
export type RoomConfig = {
  /** grace for a seated player in a running game */
  gracePlayingMs: number
  /** grace outside a game, and for observers */
  graceIdleMs: number
  /** cap on a disconnected current player's turn */
  awayTurnCapMs: number
  /** GC after no member has been connected this long while `waiting` */
  roomTtlIdleMs: number
  /** GC after no member has been connected this long while `playing`/`waitingNextRound` */
  roomTtlActiveMs: number
  /** after a restart the running deadline becomes at least now + this (RQ-S19) */
  restartDeadlineFloorMs: number
  /** first frame must be `hello` within this (host-side, spec §3.3) */
  helloTimeoutMs: number
  maxSeats: number
  maxObservers: number
  ringSize: number
}

export const DEFAULT_ROOM_CONFIG: Readonly<RoomConfig> = Object.freeze({
  gracePlayingMs: 120_000,
  graceIdleMs: 60_000,
  awayTurnCapMs: 20_000,
  roomTtlIdleMs: 600_000,
  roomTtlActiveMs: 1_800_000,
  restartDeadlineFloorMs: 10_000,
  helloTimeoutMs: 10_000,
  maxSeats: 4,
  maxObservers: 8,
  ringSize: RING_SIZE,
})

/** A live socket the host knows about: `(pid, connNo)`. */
export type LiveConn = { pid: Pid; connNo: number }

export type SessionInput =
  /**
   * An accepted `hello` (pid already derived from the sid by the host).
   * `connNo` must exceed every connNo previously used for this pid; the host uses
   * `(state.members[pid]?.connNo ?? 0) + 1`. `name` is the raw hello name (the reducer validates it).
   */
  | {
      type: 'connect'
      pid: Pid
      name: string
      connNo: number
      lastSeq: number | null
      epoch: string | null
    }
  /** socket close/error or sweep; ignored unless `connNo === member.connNo` */
  | { type: 'disconnect'; pid: Pid; connNo: number }
  /** a parsed `cmd` frame from socket `(pid, connNo)` */
  | { type: 'command'; pid: Pid; connNo: number; id: string; cmd: Cmd }
  /** alarm fired (timestamps decide what is due, so duplicates are no-ops) */
  | { type: 'tick' }
  /** on wake/restart: the sockets that are actually attached (RQ-S19) */
  | { type: 'reconcile'; live: LiveConn[] }

export type ReducerDeps = {
  /** epoch ms */
  now: number
  rng: Rng
  engine: GameEngine
  config: RoomConfig
}

export type AckResult = { ok: true; seq: number } | { ok: false; reason: RejectReason }

export type Directive =
  /**
   * Send a welcome to `(pid, connNo)` with `seq = result.state.version`.
   * - `snapshot`: include `viewFor(state, pid)`.
   * - `replay`: then send ring events with `seq >= fromSeq` (rendered per viewer from their stored post-state).
   * - `current`: nothing follows.
   * For `snapshot`/`current`, `fromSeq = state.version + 1`.
   */
  | { type: 'welcome'; pid: Pid; connNo: number; mode: WelcomeMode; fromSeq: number }
  /** reply to command `id` from `(pid, connNo)` */
  | { type: 'ack'; pid: Pid; connNo: number; id: string; result: AckResult }
  /** send `bye{reason}` to `(pid, connNo)` and close it with `code` */
  | { type: 'bye'; pid: Pid; connNo: number; reason: ByeReason; code: number }
  /** send `bye{reason}` to every attached socket and close each with `code` */
  | { type: 'close'; reason: ByeReason; code: number }
  /** the room was garbage-collected: wipe storage, delete the alarm, release the lobby row */
  | { type: 'destroy' }

export type ReducerResult = {
  /** reference-equal to the input state when nothing changed (e.g. a rejected command) */
  state: RoomState
  /**
   * Events emitted by this input, `seq` = consecutive versions ending at `state.version`.
   * The host broadcasts each to every attached socket whose `(pid, connNo)` is a connected
   * member's current connection, rendered with `viewFor(state, pid)`, except a connection
   * welcomed in this same result (its welcome already covers them). Events are sent before
   * the directives.
   */
  events: { seq: number; e: RoomEvent }[]
  /** processed in order, after persisting and broadcasting events */
  directives: Directive[]
  /** next alarm from game deadline, grace and GC (the host adds its own sweep time) */
  wakeAt: number | null
  /** connected members, reported to the lobby when it changes */
  lobbyCount: number
}

export type RoomReducer = (
  state: RoomState,
  input: SessionInput,
  deps: ReducerDeps,
) => ReducerResult

export type InitialRoomState = (roomId: string, epoch: string, config: RoomConfig) => RoomState

/** Per-viewer redacted view (spec §6.3). `pid` may be a non-member (renders as an observer). */
export type ViewFor = (state: RoomState, pid: Pid) => View
