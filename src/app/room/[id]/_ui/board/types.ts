/**
 * Shared board contracts (spec §6.2–§6.4, §9.3). Created by Foundation; consumed by the
 * cards (T1), table (T2) and board (T3) tasks and by the design gallery (T5).
 */
import type { LayoutMode } from '@/design/use-layout-mode'
import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import type { SubmitResultCode as ProtocolSubmitResultCode } from '@/shared/protocol'
import type { ReactNode } from 'react'

export type { LayoutMode }

/** One seat as rendered by `Seat`, `SeatLine` and `SeatRing` (built by `seat-model.ts`). */
export type SeatModel = {
  /** connection / player id */
  id: string
  name: string
  /** cards in hand; `null` for observers or before the first game state */
  handCount: number | null
  /** playOrder index (not self-relative), so a player's hue is the same on every client */
  hueIndex: number
  /** self-relative ring index: self = 0, then clockwise in play order */
  k: number
  isSelf: boolean
  /** it is this seat's turn (`ctx.currentPlayer`) */
  isActive: boolean
  /** owns the current field top (`gameState.deckTopPlayer`) */
  isLead: boolean
  /** passed during the current rotation (client-derived, cleared on flow or play) */
  passed: boolean
  /** watching, not playing (`観戦`) */
  observer: boolean
  /** seconds left on the active seat's clock */
  leftTime?: number
  timeLimit?: number
  /** penalty cards just received (`+n` chip) */
  penalty?: number
  /** `false` while the member's socket is gone (grace period); omitted when connected */
  connected?: boolean
}

/**
 * Server result codes for a submission, derived from the protocol so new codes surface here.
 * `INVALID_FACT` stays in the union for compatibility; the server never emits it.
 */
export type SubmitResultCode = ProtocolSubmitResultCode

/** What `ResultOverlay` visualises after the server has judged a submission. */
export type SubmitResultView = {
  kind: 'ok' | 'BASE_IS_NOT_PRIME' | 'FACT_CONTAIN_NOT_PRIME' | 'INCORRECT_ANSWER'
  /** concatenated value of the submitted cards */
  value: number
  factor?: FactCardId[]
  /** evaluated factor expression (INCORRECT_ANSWER) */
  evaluated?: number
  /** index of the offending factor among the number groups (FACT_CONTAIN_NOT_PRIME) */
  offendingIndex?: number
  /** cards drawn as a penalty */
  penalty: number
  /** submitter display name */
  submitter: string
}

/** Visual events produced by `classifyTransition` and played by `useBoardDirector` (§9.3). */
export type BoardEvent =
  | { type: 'deal' }
  | { type: 'draw'; who: 'me' | 'other'; playerId: string }
  | { type: 'submit-ok'; playerId: string; cards: CardId[]; factor: FactCardId[] }
  | {
      type: 'submit-fail'
      code: SubmitResultCode
      playerId: string
      value: number
      factor: FactCardId[]
      /** next.handCount − prev.handCount for the submitter */
      penalty: number
    }
  | { type: 'pass'; playerId: string }
  /** field non-empty → [] not caused by a 57 cut */
  | { type: 'flow' }
  /** successful submission of exactly 57 */
  | { type: 'cut57'; playerId: string; cards: CardId[] }
  | { type: 'turn'; from: string | null; to: string }
  /** game-end / waitingNextRound, held by the director until the winning submit has played */
  | { type: 'end'; winner: string | null }

export type BoardEventType = BoardEvent['type']

/** A numbered line of the proof log. */
export type LogEntry = {
  id: string
  node: ReactNode
  kind?: 'system' | 'play' | 'fail' | 'pass' | 'end'
}

/** Why the draw action is unavailable. */
export type DrawDisabledReason = 'drawn' | 'empty' | 'not-your-turn'

/** WebSocket / sync state shown by `ConnectionOverlay`. */
export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error' | 'waiting-sync'
