/**
 * Client session contract (spec §9.1). Frozen: owned by the foundation, implemented by T4
 * (`use-room-session.ts`), consumed by the room container (T6).
 *
 * The UI talks to the backend only through `useRoomSession(roomId): RoomSession` (RQ-C1).
 */
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import type { BotLevel } from '@/shared/bot'
import type { ClientGameStateBundle, SystemMessage } from '@/shared/client-state'
import type { CardId } from '@/shared/ids'
import type { RejectReason, RoomEvent, RoomStatus } from '@/shared/protocol'
import type { TurnClock } from '../_ui/board/TurnTimer'

export type { ClientGameStateBundle, SystemMessage, TurnClock }

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'waiting-sync'

/** Why the session ended for good (terminal `bye`); `null` while not closed for good. */
export type CloseReason =
  | 'superseded'
  | 'left'
  | 'room-full'
  | 'bad-name'
  | 'upgrade-required'
  | 'room-gone'
  | null

export type SessionPresence = {
  id: string
  name: string
  status: 'ready' | 'not-ready'
  role: 'player' | 'observer'
  connected: boolean
  /** set only for bot seats */
  bot?: BotLevel
}

/** What the director receives: a game message, a snapshot (no animation) or a rule change. */
export type TransitionMsg =
  | SystemMessage
  | { action: 'snapshot' }
  | { action: 'change-rule'; rule: PrimeDaifugoSetupData; by: string }

export type SessionTransition = {
  prev: ClientGameStateBundle | null
  next: ClientGameStateBundle
  msg: TransitionMsg
  /** the server event behind this transition; null for welcome/gap snapshots */
  event: RoomEvent | null
}

export type AckResult =
  | { ok: true }
  | { ok: false; reason: RejectReason | 'timeout' | 'disconnected' }

export type RoomSessionActions = {
  setReady(): Promise<AckResult>
  unsetReady(): Promise<AckResult>
  changeRule(rule: Partial<PrimeDaifugoSetupData>): Promise<AckResult>
  /** sends expectedVersion = current version */
  startGame(): Promise<AckResult>
  /** sends the current turn */
  draw(): Promise<AckResult>
  /** sends the current turn */
  pass(): Promise<AckResult>
  submit(set: { submit: CardId[]; factor: FactCardId[] }): Promise<AckResult>
  /** seat a bot (between games) */
  addBot(level: BotLevel): Promise<AckResult>
  removeBot(pid: string): Promise<AckResult>
  leave(): Promise<void>
  reconnect(): void
}

export type RoomSession = {
  selfId: string | null
  connection: ConnectionState
  closeReason: CloseReason
  presence: SessionPresence[]
  roomStatus: RoomStatus | null
  rule: PrimeDaifugoSetupData
  /** `{ gameState, ctx }` in the UI shape (spec §9.3) */
  game: ClientGameStateBundle | null
  version: number
  /** existing TurnClock store; driven from the deadline */
  clock: TurnClock
  subscribe(listener: (t: SessionTransition) => void): () => void
  actions: RoomSessionActions
}
