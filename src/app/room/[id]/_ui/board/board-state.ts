/**
 * Pure derivations the GameBoard container makes from server state (spec §6.4): kept out of
 * the component so they can be unit-tested on their own. No React, no socket.
 */
import type { CardId } from '@/game-card/src'
import { concatValue } from '@/game/numbers'
import type { ClientPlayer, SubmitCardSet } from '@/shared/client-state'
import type { RoomStatus as ProtocolRoomStatus } from '@/shared/protocol'
import { isValidFactCardIds } from '@/utils/play-card'
import type { ActionBarProps } from './ActionBar'
import type { ConnectionState, DrawDisabledReason, LayoutMode } from './types'

/** Where the ActionBar sits in each layout mode (§7.5). */
export const ACTION_ORIENTATION = {
  compact: 'rail',
  regular: 'rail',
  portrait: 'bottom',
  wide: 'row',
} as const satisfies Record<LayoutMode, ActionBarProps['orientation']>

type RoomStatus = ProtocolRoomStatus | null

/**
 * The one `> 場` rule, shared by the tray hint (`trayChecks`) and the submit gate: the value
 * must be strictly greater than the field top, as the server requires (a tie is an invalid
 * move there). Always true on a free field. Compared as BigInt like the engine (RQ-R3): a JS
 * number loses precision past 15-16 digits and would block legal multi-card plays.
 */
export function beatsField(cards: CardId[], fieldTop: CardId[] | null | undefined): boolean {
  if (!fieldTop || fieldTop.length === 0) {
    return true
  }
  return concatValue(cards) > concatValue(fieldTop)
}

export const SUBMIT_ERRORS = {
  notGreater: '場のカードの数より大きくないといけません',
  count: '出すカードの枚数が合っていません',
  invalidFact: '素因数分解として成立していません',
} as const

/** Client-side checks before a submit is sent; `null` when the move may go to the server. */
export function validateSubmitCardSet(
  fieldTop: CardId[] | undefined,
  submitCardSet: SubmitCardSet,
): string | null {
  const asFactMode = submitCardSet.factor.length > 0

  if (fieldTop !== undefined) {
    if (!beatsField(submitCardSet.submit, fieldTop)) {
      return SUBMIT_ERRORS.notGreater
    }
    if (submitCardSet.submit.length !== fieldTop.length) {
      return SUBMIT_ERRORS.count
    }
  }

  if (!asFactMode) {
    return null
  }
  if (fieldTop === undefined && !isValidFactCardIds(submitCardSet.factor)) {
    return SUBMIT_ERRORS.invalidFact
  }
  return null
}

/** Why 引く is disabled, or `null` when drawing is allowed. */
export function drawDisabledReason({
  isMyTurn,
  drawRight,
  deckCount,
}: {
  isMyTurn: boolean
  drawRight: boolean | undefined
  deckCount: number
}): DrawDisabledReason | null {
  if (!isMyTurn) {
    return 'not-your-turn'
  }
  if (drawRight === false) {
    return 'drawn'
  }
  if (deckCount === 0) {
    return 'empty'
  }
  return null
}

/**
 * The ConnectionOverlay state from the socket and the sync progress. Kept for the gallery and
 * tests; the room container reads `session.connection` instead (spec §9.2).
 */
export function connectionStateOf({
  readyState,
  roomStatus,
  hasGameState,
  errored = false,
}: {
  /** `WebSocket.readyState`: 0 connecting, 1 open, 2 closing, 3 closed */
  readyState: number
  roomStatus: RoomStatus
  hasGameState: boolean
  /** the socket reported an error since it last opened */
  errored?: boolean
}): ConnectionState {
  if (readyState === 0) {
    return 'connecting'
  }
  if (readyState !== 1) {
    return errored ? 'error' : 'closed'
  }
  if (roomStatus === null || (roomStatus !== 'waiting' && !hasGameState)) {
    return 'waiting-sync'
  }
  return 'open'
}

/**
 * Whether this client only watches: marked not-ready, or absent from the game's players
 * (joined after the deal).
 */
export function isObserver(
  selfStatus: 'ready' | 'not-ready' | undefined,
  players: Record<string, unknown> | undefined,
  selfId: string,
): boolean {
  return selfStatus === 'not-ready' || (players !== undefined && !(selfId in players))
}

type HandCounts = Record<string, Pick<ClientPlayer, 'handCount'>>

/** Cards in `id`'s hand by count (other players' `hand` is always `[]`, spec §9.3). */
export function handSize(players: HandCounts | null | undefined, id: string): number {
  return players?.[id]?.handCount ?? 0
}

/** `id`'s own card ids: only ever non-empty for self (`[]` for others and absentees). */
export function handOf(
  players: Record<string, Pick<ClientPlayer, 'hand'>> | null | undefined,
  id: string,
): ClientPlayer['hand'] {
  return players?.[id]?.hand ?? []
}

/**
 * The winner: the server's `gameState.winner` when known (a last-standing win leaves cards in
 * hand), else the player whose hand count is 0.
 */
export function winnerIdOf(
  players: HandCounts | null | undefined,
  winner: string | null = null,
): string | undefined {
  if (winner !== null) {
    return winner
  }
  if (!players) {
    return undefined
  }
  return Object.keys(players).find((id) => players[id].handCount === 0)
}
