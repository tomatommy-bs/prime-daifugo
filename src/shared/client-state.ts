/**
 * UI-facing game state (spec §9.3), produced by the client adapter (`viewToBundle`, T4) and read
 * by the board modules (T5) and the room container (T6). Frozen contract (foundation).
 *
 * Other players' `hand` is always `[]`; use `handCount` (RQ-S16).
 */
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import type { CardId, Pid } from './ids'
import type { SubmitResultCode } from './protocol'

export type ClientPlayer = {
  /** own hand; `[]` for every other player */
  hand: CardId[]
  handCount: number
  drawRight: boolean
}

export type ClientGameState = {
  players: Record<Pid, ClientPlayer>
  field: CardId[][]
  deckCount: number
  deckTopPlayer: Pid | null
  rule: PrimeDaifugoSetupData
  winner: Pid | null
  lastSubmitError: SubmitResultCode | null
}

export type ClientCtx = {
  currentPlayer: Pid
  playOrder: Pid[]
  turn: number
  /** epoch ms (server clock); null outside `playing` */
  deadline: number | null
}

export type ClientGameStateBundle = { gameState: ClientGameState; ctx: ClientCtx }

export type Commander = { id: Pid; name: string }

export type SubmitCardSet = { submit: CardId[]; factor: FactCardId[] }

/**
 * Game messages the board director animates (spec §9.2): what `classifyTransition` switches on.
 * Built from `RoomEvent`s by `eventToSystemMessage` (T4):
 * - `game-started` → `game-start`
 * - `drew` → `draw`
 * - `passed` → `pass` (`reason` tells a manual pass from a timeout)
 * - `submitted` → `submit`
 * - `game-ended` → `game-end` (`winner` is the display name, `winnerId` the pid)
 */
export type SystemMessage =
  | { action: 'game-start'; commander: Commander }
  | { action: 'draw'; commander: Commander }
  | { action: 'pass'; commander: Commander; reason: 'manual' | 'timeout' }
  | {
      action: 'submit'
      commander: Commander
      submissionResult: { submitCardSet: SubmitCardSet; result: SubmitResultCode | null }
    }
  | { action: 'game-end'; winner: string; winnerId: Pid }

export type SystemAction = SystemMessage['action']
