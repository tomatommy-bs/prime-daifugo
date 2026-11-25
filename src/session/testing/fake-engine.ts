/**
 * A small deterministic `GameEngine` for session tests. It honours the frozen contract (turns,
 * one draw per turn, draws from the end of the deck, flow, card conservation, end condition,
 * forfeit) with a trivial judgement instead of primes:
 *
 * - a submit is well formed when it is non-empty, uses distinct cards from the hand, has at most
 *   `maxSubmitNumCards` cards, matches the top set's size on a non-empty field and has an empty
 *   factor (any factor token → `invalid-fact`);
 * - it succeeds when its first card is black (♠/♣), otherwise `BASE_IS_NOT_PRIME` with a penalty
 *   of `submit.length` cards (or what is left of the deck);
 * - a successful `[5x, 7y]` (black 5 first) is a 57 cut: the same player leads on a flowed field.
 *
 * The input core is never mutated.
 */
import type {
  ApplyMoveResult,
  CardId,
  GameCore,
  GameEngine,
  Move,
  PassedOutcome,
  Pid,
  PrimeDaifugoSetupData,
  Rng,
  SetupResult,
} from '../../game/types'
import { CARD_IDS } from '../../shared/ids'
import { shuffle } from '../../shared/rng'

const HALF_EVEN_REMOVED = new Set(['2', '4', '6', '8', '10', 'Q'])

const rankOf = (card: string) => card.slice(0, -1)
const suitOf = (card: string) => card.slice(-1)

/** The deck for a rule: 52 cards, or 40 with `halfEvenNumbers` (RQ-R5). */
export function fullDeck(rule: PrimeDaifugoSetupData): CardId[] {
  return CARD_IDS.filter(
    (c) =>
      !(
        rule.halfEvenNumbers &&
        (suitOf(c) === 'H' || suitOf(c) === 'D') &&
        HALF_EVEN_REMOVED.has(rankOf(c))
      ),
  )
}

const clone = (core: GameCore): GameCore => JSON.parse(JSON.stringify(core)) as GameCore

/** Next seat after `pid` in `order` (or the first seat if `pid` is gone). */
function nextSeat(order: Pid[], pid: Pid): Pid {
  const i = order.indexOf(pid)
  return order[(i + 1) % order.length]
}

/** Move the turn to `next`, flowing the field if it is the deckTopPlayer (RQ-R11). */
function advance(core: GameCore, next: Pid, rng: Rng): boolean {
  core.currentPlayer = next
  core.turn += 1
  if (core.deckTopPlayer !== null && core.deckTopPlayer === next) {
    flow(core, rng)
    return true
  }
  return false
}

function flow(core: GameCore, rng: Rng): void {
  core.deck = shuffle([...core.deck, ...core.field.flat()], rng)
  core.field = []
  core.deckTopPlayer = null
}

function drawCards(core: GameCore, pid: Pid, n: number): number {
  const k = Math.min(n, core.deck.length)
  for (let i = 0; i < k; i += 1) {
    core.players[pid].hand.push(core.deck.pop() as CardId)
  }
  return k
}

export function createFakeEngine(): GameEngine {
  const setup = (seats: Pid[], rule: PrimeDaifugoSetupData, rng: Rng): SetupResult => {
    if (seats.length < 2 || seats.length > 4 || new Set(seats).size !== seats.length) {
      return { ok: false, reason: 'bad-player-count' }
    }
    const deck = shuffle(fullDeck(rule), rng)
    if (rule.initNumCards * seats.length > deck.length) {
      return { ok: false, reason: 'deck-too-small' }
    }
    const players: GameCore['players'] = {}
    for (const pid of seats) {
      players[pid] = { hand: deck.splice(deck.length - rule.initNumCards), drawRight: true }
    }
    return {
      ok: true,
      core: {
        rule: { ...rule },
        playOrder: [...seats],
        currentPlayer: seats[0],
        turn: 0,
        players,
        deck,
        field: [],
        deckTopPlayer: null,
        lastResult: null,
        winner: null,
      },
    }
  }

  const pass = (input: GameCore, rng: Rng): { core: GameCore; outcome: PassedOutcome } => {
    const core = clone(input)
    const by = core.currentPlayer
    core.players[by].drawRight = true
    const flowed = advance(core, nextSeat(core.playOrder, by), rng)
    return { core, outcome: { kind: 'passed', flowed } }
  }

  const applyMove = (input: GameCore, by: Pid, move: Move, rng: Rng): ApplyMoveResult => {
    if (input.winner !== null) {
      return { ok: false, reason: 'bad-status' }
    }
    if (input.currentPlayer !== by) {
      return { ok: false, reason: 'not-your-turn' }
    }
    if (move.type === 'pass') {
      const r = pass(input, rng)
      return { ok: true, core: r.core, outcome: r.outcome }
    }
    if (move.type === 'draw') {
      if (!input.players[by].drawRight) {
        return { ok: false, reason: 'already-drawn' }
      }
      if (input.deck.length === 0) {
        return { ok: false, reason: 'deck-empty' }
      }
      const core = clone(input)
      drawCards(core, by, 1)
      core.players[by].drawRight = false
      return { ok: true, core, outcome: { kind: 'drew' } }
    }
    const { submit, factor } = move
    const hand = input.players[by].hand
    const top = input.field[input.field.length - 1]
    if (
      submit.length === 0 ||
      submit.length > input.rule.maxSubmitNumCards ||
      new Set(submit).size !== submit.length ||
      !submit.every((c) => hand.includes(c)) ||
      (top !== undefined && top.length !== submit.length)
    ) {
      return { ok: false, reason: 'invalid-move' }
    }
    if (factor.length > 0) {
      return { ok: false, reason: 'invalid-fact' }
    }
    const core = clone(input)
    const player = core.players[by]
    const success = suitOf(submit[0]) === 'S' || suitOf(submit[0]) === 'C'
    player.drawRight = true
    if (!success) {
      const penalty = drawCards(core, by, submit.length)
      core.lastResult = 'BASE_IS_NOT_PRIME'
      const flowed = advance(core, nextSeat(core.playOrder, by), rng)
      return {
        ok: true,
        core,
        outcome: {
          kind: 'submitted',
          result: 'BASE_IS_NOT_PRIME',
          cut57: false,
          flowed,
          penalty,
          ended: false,
        },
      }
    }
    player.hand = player.hand.filter((c) => !submit.includes(c))
    core.field.push([...submit])
    core.deckTopPlayer = by
    core.lastResult = null
    if (player.hand.length === 0) {
      core.winner = by
      return {
        ok: true,
        core,
        outcome: {
          kind: 'submitted',
          result: null,
          cut57: false,
          flowed: false,
          penalty: 0,
          ended: true,
        },
      }
    }
    const cut57 = submit.length === 2 && rankOf(submit[0]) === '5' && rankOf(submit[1]) === '7'
    let flowed: boolean
    if (cut57) {
      flow(core, rng)
      core.turn += 1
      flowed = true
    } else {
      flowed = advance(core, nextSeat(core.playOrder, by), rng)
    }
    return {
      ok: true,
      core,
      outcome: { kind: 'submitted', result: null, cut57, flowed, penalty: 0, ended: false },
    }
  }

  const timeoutPass = (input: GameCore, rng: Rng) => pass(input, rng)

  const forfeit = (input: GameCore, pid: Pid, rng: Rng) => {
    const core = clone(input)
    if (!core.playOrder.includes(pid)) {
      return { core, flowed: false, ended: core.winner !== null }
    }
    const wasCurrent = core.currentPlayer === pid
    const next = nextSeat(core.playOrder, pid)
    core.deck = shuffle([...core.deck, ...core.players[pid].hand], rng)
    delete core.players[pid]
    core.playOrder = core.playOrder.filter((p) => p !== pid)
    let flowed = false
    if (core.deckTopPlayer === pid) {
      flow(core, rng)
      flowed = true
    }
    if (core.playOrder.length === 1) {
      core.winner = core.playOrder[0]
      if (wasCurrent) {
        core.currentPlayer = core.playOrder[0]
      }
      return { core, flowed, ended: true }
    }
    if (wasCurrent) {
      core.currentPlayer = next
      core.turn += 1
    }
    return { core, flowed, ended: false }
  }

  return { setup, applyMove, timeoutPass, forfeit }
}

/** Shared instance (the engine is stateless). */
export const fakeEngine: GameEngine = createFakeEngine()
