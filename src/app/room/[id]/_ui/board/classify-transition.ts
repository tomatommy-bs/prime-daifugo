import type { TransitionMsg } from '@/app/room/[id]/session/types'
/**
 * `classifyTransition` (§9.3): a pure function that turns one server game event into the
 * visual BoardEvents the director plays. State is applied by the container regardless;
 * this only decides what to *show*.
 */
import { WORLD_CONFIG } from '@/constants/config'
import { typesetExpr } from '@/design/Expr'
import type { CardId } from '@/game-card/src'
import type { ClientGameStateBundle, SystemMessage as GameMessage } from '@/shared/client-state'
import { concatCardNumbers, evalFactCardIds, isValidFactCardIds } from '@/utils/play-card'
import pf from 'primes-and-factors'
import type { BoardEvent, SubmitResultView } from './types'

/** The UI state pair every transition carries (rebuild spec §9.3). */
export type GameState = ClientGameStateBundle

/** A game message the director animates (built from a `RoomEvent` by the session adapter). */
export type SystemMessage = GameMessage

/** Anything a session transition carries: game messages, snapshots and rule changes. */
export type { TransitionMsg }

/** Hand size by count: other players' `hand` is always `[]` (RQ-S16). */
const handSize = (s: GameState | null, id: string) => s?.gameState.players[id]?.handCount ?? 0

const fieldEmptied = (prev: GameState | null, next: GameState) =>
  (prev?.gameState.field.length ?? 0) > 0 && next.gameState.field.length === 0

function turnEvent(prev: GameState | null, next: GameState): BoardEvent[] {
  const from = prev?.ctx.currentPlayer ?? null
  const to = next.ctx.currentPlayer
  return from === to ? [] : [{ type: 'turn', from, to }]
}

/**
 * Visual events for `msg`, in play order.
 * - `game-start` → deal, turn
 * - `draw` → draw (me | other)
 * - `pass` → pass, flow?, turn?
 * - `submit` → submit-ok | cut57 | submit-fail (penalty = next.handCount − prev.handCount),
 *   flow?, turn?
 * - `game-end` → end (the director holds it until the winning submit has played)
 * - `snapshot`, `change-rule` → nothing (state is applied without animation)
 */
export function classifyTransition(
  prev: GameState | null,
  next: GameState,
  msg: TransitionMsg,
  selfId: string,
): BoardEvent[] {
  switch (msg.action) {
    case 'game-start':
      return [{ type: 'deal' }, { type: 'turn', from: null, to: next.ctx.currentPlayer }]
    case 'draw': {
      const playerId = msg.commander.id
      return [{ type: 'draw', who: playerId === selfId ? 'me' : 'other', playerId }]
    }
    case 'pass': {
      const events: BoardEvent[] = [{ type: 'pass', playerId: msg.commander.id }]
      if (fieldEmptied(prev, next)) {
        events.push({ type: 'flow' })
      }
      return [...events, ...turnEvent(prev, next)]
    }
    case 'submit': {
      const playerId = msg.commander.id
      const { submitCardSet, result } = msg.submissionResult
      const value = concatCardNumbers(submitCardSet.submit)
      const events: BoardEvent[] = []
      if (result === null) {
        if (value === WORLD_CONFIG.GROTHENDIECK_PRIME) {
          // The cut clears the field and keeps the turn: never a plain flow.
          return [
            { type: 'cut57', playerId, cards: submitCardSet.submit },
            ...turnEvent(prev, next),
          ]
        }
        events.push({
          type: 'submit-ok',
          playerId,
          cards: submitCardSet.submit,
          factor: submitCardSet.factor,
        })
      } else {
        events.push({
          type: 'submit-fail',
          code: result,
          playerId,
          value,
          factor: submitCardSet.factor,
          penalty: Math.max(0, handSize(next, playerId) - handSize(prev, playerId)),
        })
      }
      if (fieldEmptied(prev, next)) {
        events.push({ type: 'flow' })
      }
      return [...events, ...turnEvent(prev, next)]
    }
    case 'game-end':
      return [{ type: 'end', winner: msg.winner }]
    default:
      return []
  }
}

/**
 * Index (among the number groups, as `Expr` counts them) of the first factor base that is
 * not prime. Only called for a FACT_CONTAIN_NOT_PRIME result, i.e. after the server judged.
 */
export function offendingFactorIndex(factor: SubmitResultView['factor']): number | undefined {
  for (const t of typesetExpr(factor ?? [])) {
    if (t.kind === 'num' && !t.exponent && !pf.isPrime(Number(t.value))) {
      return t.index
    }
  }
  return undefined
}

const safeEval = (factor: SubmitResultView['factor']): number | undefined =>
  factor && isValidFactCardIds(factor) ? evalFactCardIds(factor) : undefined

/**
 * What `ResultOverlay` shows for a submit event (null for every other event and for
 * INVALID_FACT, which the server rejects silently).
 */
export function resultViewOf(event: BoardEvent | null, submitter: string): SubmitResultView | null {
  if (event?.type === 'submit-ok') {
    return {
      kind: 'ok',
      value: concatCardNumbers(event.cards),
      factor: event.factor.length > 0 ? event.factor : undefined,
      penalty: 0,
      submitter,
    }
  }
  if (event?.type !== 'submit-fail' || event.code === 'INVALID_FACT') {
    return null
  }
  const factor = event.factor.length > 0 ? event.factor : undefined
  return {
    kind: event.code,
    value: event.value,
    factor,
    evaluated: event.code === 'INCORRECT_ANSWER' ? safeEval(factor) : undefined,
    offendingIndex:
      event.code === 'FACT_CONTAIN_NOT_PRIME' ? offendingFactorIndex(factor) : undefined,
    penalty: event.penalty,
    submitter,
  }
}

/** Client-derived round memory the seats and the dialog need (§7.5 SeatLine). */
export type BoardMemo = {
  /** passed during the current rotation: cleared on flow / cut / deal, or when the seat plays */
  passedIds: string[]
  /** successful plays this round (GameSetDialog) */
  plays: number
  /** penalty cards of the latest failed submit, by seat (`+n` chip) */
  penalties: Record<string, number>
}

export const EMPTY_MEMO: BoardMemo = { passedIds: [], plays: 0, penalties: {} }

/** Fold one visual event into the memo (pure). */
export function reduceMemo(memo: BoardMemo, e: BoardEvent): BoardMemo {
  switch (e.type) {
    case 'deal':
      return EMPTY_MEMO
    case 'flow':
      return { ...memo, passedIds: [] }
    case 'cut57':
      return { ...memo, passedIds: [], plays: memo.plays + 1 }
    case 'pass':
      return memo.passedIds.includes(e.playerId)
        ? memo
        : { ...memo, passedIds: [...memo.passedIds, e.playerId] }
    case 'submit-ok':
      return {
        ...memo,
        passedIds: memo.passedIds.filter((id) => id !== e.playerId),
        plays: memo.plays + 1,
      }
    case 'submit-fail':
      return {
        ...memo,
        passedIds: memo.passedIds.filter((id) => id !== e.playerId),
        penalties: { [e.playerId]: e.penalty },
      }
    default:
      return memo
  }
}

/** Cards that just arrived in `selfId`'s hand through a draw or a penalty (`fresh`). */
export function freshCards(
  prev: GameState | null,
  next: GameState,
  events: BoardEvent[],
  selfId: string,
): CardId[] | null {
  const mine = events.some(
    (e) =>
      (e.type === 'draw' && e.who === 'me') || (e.type === 'submit-fail' && e.playerId === selfId),
  )
  if (!mine) {
    return null
  }
  const before = new Set(prev?.gameState.players[selfId]?.hand ?? [])
  return (next.gameState.players[selfId]?.hand ?? []).filter((c) => !before.has(c))
}

/** The LiveRegion line for an event, or null (§9.2 #8, #19–#25). */
export function announcementOf(
  e: BoardEvent,
  nameOf: (id: string) => string,
  selfId: string,
): string | null {
  switch (e.type) {
    case 'turn':
      return e.to === selfId ? 'あなたの番です' : null
    case 'submit-ok':
      return `${nameOf(e.playerId)} が ${concatCardNumbers(e.cards)} を出しました`
    case 'cut57':
      return `${nameOf(e.playerId)} の 57 — グロタンディーク素数切り。もう一度`
    case 'submit-fail':
      return `${nameOf(e.playerId)} の ${e.value} は不成立。ペナルティ +${e.penalty} 枚`
    case 'flow':
      return '流れ'
    default:
      return null
  }
}
