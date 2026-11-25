/**
 * Rules engine (spec §7, RQ-R6..RQ-R20, forfeit §3.6), implementing the frozen `GameEngine`
 * contract of `./types`.
 *
 * - Pure and deterministic: every shuffle uses the injected `Rng`; no clock, no global randomness.
 * - Never mutates its input: each call works on a `structuredClone`, and a rejected move returns
 *   no core at all.
 * - `GameCore` stays plain JSON (BigInt is used only for intermediate arithmetic).
 */
import { shuffle } from '../shared/rng'
import { type CardId, buildDeck, isCardId } from './cards'
import { checkFact, factCards, parseFact } from './factor'
import { GROTHENDIECK, concatValue, isPrime } from './numbers'
import type {
  ApplyMoveResult,
  EngineReject,
  GameCore,
  GameEngine,
  Move,
  PassedOutcome,
  Pid,
  PrimeDaifugoSetupData,
  Rng,
  SetupResult,
  SubmitResultCode,
} from './types'

export const MIN_SEATS = 2
export const MAX_SEATS = 4

const clone = (core: GameCore): GameCore => structuredClone(core)

/** Flow (流れ, RQ-R11): the field is shuffled into the deck and nobody holds the deck top. */
function flow(core: GameCore, rng: Rng): void {
  core.deck = shuffle([...core.field.flat(), ...core.deck], rng)
  core.field = []
  core.deckTopPlayer = null
}

/**
 * End the current turn (RQ-R11): `next` becomes the current player, `turn` increments, and the
 * field flows when `next` holds the deck top. Returns whether it flowed.
 */
function endTurn(core: GameCore, next: Pid, rng: Rng): boolean {
  core.currentPlayer = next
  core.turn += 1
  if (core.deckTopPlayer !== null && core.deckTopPlayer === next) {
    flow(core, rng)
    return true
  }
  return false
}

/** The seat after `pid` in `playOrder`. */
function nextSeat(core: GameCore, pid: Pid): Pid {
  const index = core.playOrder.indexOf(pid)
  return core.playOrder[(index + 1) % core.playOrder.length]
}

/** Take up to `count` cards from the END of the deck (RQ-R15). Returns how many were drawn. */
function drawFromEnd(core: GameCore, pid: Pid, count: number): number {
  const hand = core.players[pid].hand
  let drawn = 0
  while (drawn < count && core.deck.length > 0) {
    hand.push(core.deck.pop() as CardId)
    drawn += 1
  }
  return drawn
}

function removeFromHand(hand: CardId[], cards: readonly CardId[]): CardId[] {
  const remove = new Set(cards)
  return hand.filter((card) => !remove.has(card))
}

function setup(seats: Pid[], rule: PrimeDaifugoSetupData, rng: Rng): SetupResult {
  if (
    seats.length < MIN_SEATS ||
    seats.length > MAX_SEATS ||
    new Set(seats).size !== seats.length
  ) {
    return { ok: false, reason: 'bad-player-count' }
  }
  const deck = shuffle(buildDeck(rule), rng)
  if (deck.length < rule.initNumCards * seats.length) {
    return { ok: false, reason: 'deck-too-small' }
  }
  const players: GameCore['players'] = {}
  for (const pid of seats) {
    players[pid] = { hand: deck.splice(0, rule.initNumCards), drawRight: true }
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

type ValidSubmit = { ok: true; submit: CardId[]; factorCards: CardId[]; target: bigint }

/** RQ-R12 validation of a submit, in order. Reads `core` only. */
function validateSubmit(
  core: GameCore,
  by: Pid,
  submit: unknown,
  factor: unknown,
): { ok: false; reason: EngineReject } | ValidSubmit {
  if (!Array.isArray(submit) || !Array.isArray(factor) || submit.length === 0) {
    return { ok: false, reason: 'invalid-move' }
  }
  if (submit.length > core.rule.maxSubmitNumCards) {
    return { ok: false, reason: 'invalid-move' }
  }
  // the submit and factor card tokens are distinct and all in the hand (multiset check)
  const factorTokens = factor.filter((token) => token !== '*' && token !== '^')
  const hand = new Set<string>(core.players[by].hand)
  const seen = new Set<unknown>()
  for (const token of [...submit, ...factorTokens]) {
    if (!isCardId(token) || !hand.has(token) || seen.has(token)) {
      return { ok: false, reason: 'invalid-move' }
    }
    seen.add(token)
  }
  const submitCards = submit as CardId[]
  const target = concatValue(submitCards)
  const top = core.field.at(-1)
  if (top !== undefined && (submitCards.length !== top.length || target <= concatValue(top))) {
    return { ok: false, reason: 'invalid-move' }
  }
  if (factor.length > 0 && !parseFact(factor).ok) {
    return { ok: false, reason: 'invalid-fact' }
  }
  return { ok: true, submit: submitCards, factorCards: factCards(factor), target }
}

/** Judge a validated submit (RQ-R13). */
function judge(factor: readonly unknown[], target: bigint): SubmitResultCode | null {
  if (factor.length === 0) {
    return isPrime(target) || target === GROTHENDIECK ? null : 'BASE_IS_NOT_PRIME'
  }
  const parsed = parseFact(factor)
  // validated before judging; the guard only keeps this function total
  return parsed.ok ? checkFact(parsed.terms, target) : 'INCORRECT_ANSWER'
}

function pass(core: GameCore, rng: Rng): PassedOutcome {
  const by = core.currentPlayer
  core.players[by].drawRight = true
  const flowed = endTurn(core, nextSeat(core, by), rng)
  return { kind: 'passed', flowed }
}

function submitMove(
  input: GameCore,
  by: Pid,
  valid: ValidSubmit,
  factor: readonly unknown[],
  rng: Rng,
): ApplyMoveResult {
  const core = clone(input)
  const player = core.players[by]
  const result = judge(factor, valid.target)
  // a judged submit ends the turn and restores the draw right (RQ-R9)
  player.drawRight = true
  core.lastResult = result
  if (result !== null) {
    // RQ-R15: BASE_IS_NOT_PRIME draws the submit size; factor failures add the factor cards
    const owed =
      result === 'BASE_IS_NOT_PRIME'
        ? valid.submit.length
        : valid.submit.length + valid.factorCards.length
    const penalty = drawFromEnd(core, by, owed)
    const flowed = endTurn(core, nextSeat(core, by), rng)
    return {
      ok: true,
      core,
      outcome: { kind: 'submitted', result, cut57: false, flowed, penalty, ended: false },
    }
  }
  // RQ-R14: success
  player.hand = removeFromHand(player.hand, [...valid.submit, ...valid.factorCards])
  core.field.push([...valid.submit])
  if (valid.factorCards.length > 0) {
    core.deck = shuffle([...core.deck, ...valid.factorCards], rng)
  }
  core.deckTopPlayer = by
  // RQ-R18: the winner is recorded before any flow resets deckTopPlayer
  const ended = player.hand.length === 0
  if (ended) {
    core.winner = by
  }
  // RQ-R17: a successful 57 keeps the turn (as a new turn) and flows at once
  const cut57 = valid.target === GROTHENDIECK
  const flowed = endTurn(core, cut57 ? by : nextSeat(core, by), rng)
  return {
    ok: true,
    core,
    outcome: { kind: 'submitted', result: null, cut57, flowed, penalty: 0, ended },
  }
}

function applyMove(input: GameCore, by: Pid, move: Move, rng: Rng): ApplyMoveResult {
  if (input.winner !== null) {
    return { ok: false, reason: 'bad-status' }
  }
  if (by !== input.currentPlayer || !input.playOrder.includes(by) || !input.players[by]) {
    return { ok: false, reason: 'not-your-turn' }
  }
  switch (move?.type) {
    case 'draw': {
      if (input.deck.length === 0) {
        return { ok: false, reason: 'deck-empty' }
      }
      if (!input.players[by].drawRight) {
        return { ok: false, reason: 'already-drawn' }
      }
      const core = clone(input)
      drawFromEnd(core, by, 1)
      core.players[by].drawRight = false
      return { ok: true, core, outcome: { kind: 'drew' } }
    }
    case 'pass': {
      const core = clone(input)
      return { ok: true, core, outcome: pass(core, rng) }
    }
    case 'submit': {
      const factor: unknown = move.factor ?? []
      const valid = validateSubmit(input, by, move.submit, factor)
      if (!valid.ok) {
        return valid
      }
      return submitMove(input, by, valid, factor as unknown[], rng)
    }
    default:
      return { ok: false, reason: 'invalid-move' }
  }
}

/**
 * The current player passes because the deadline passed: identical to a manual pass (RQ-T2),
 * flow included. After the game ended it changes nothing.
 */
function timeoutPass(input: GameCore, rng: Rng): { core: GameCore; outcome: PassedOutcome } {
  const core = clone(input)
  if (core.winner !== null) {
    return { core, outcome: { kind: 'passed', flowed: false } }
  }
  return { core, outcome: pass(core, rng) }
}

/**
 * Remove `pid` from a running game (spec §3.6):
 * 1. its hand goes into the deck, which is reshuffled;
 * 2. it leaves `playOrder` (and `players`, so card conservation holds over the remaining hands);
 * 3. if it held the deck top, the field flows immediately;
 * 4. if it was the current player, the turn moves to the next remaining seat (RQ-R11 applies);
 * 5. if one seat remains, that seat wins (`last-standing`).
 * A pid that is not seated, or a game that already ended, is left unchanged.
 */
function forfeit(
  input: GameCore,
  pid: Pid,
  rng: Rng,
): { core: GameCore; flowed: boolean; ended: boolean } {
  const core = clone(input)
  const index = core.playOrder.indexOf(pid)
  if (core.winner !== null || index === -1) {
    return { core, flowed: false, ended: core.winner !== null }
  }
  const hand = core.players[pid]?.hand ?? []
  core.deck = shuffle([...core.deck, ...hand], rng)
  delete core.players[pid]
  core.playOrder = core.playOrder.filter((seat) => seat !== pid)

  let flowed = false
  if (core.deckTopPlayer === pid) {
    flow(core, rng)
    flowed = true
  }
  if (core.currentPlayer === pid) {
    const next = core.playOrder[index % core.playOrder.length]
    flowed = endTurn(core, next, rng) || flowed
  }
  const ended = core.playOrder.length === 1
  if (ended) {
    core.winner = core.playOrder[0]
  }
  return { core, flowed, ended }
}

export const engine: GameEngine = { setup, applyMove, timeoutPass, forfeit }
