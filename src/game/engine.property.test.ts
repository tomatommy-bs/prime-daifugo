/**
 * Property tests (spec §7.4) over random legal and illegal move sequences, seeded and replayable:
 * - card conservation: the multiset of hands, field and deck equals the initial deck;
 * - `currentPlayer ∈ playOrder`;
 * - a rejected move leaves the state unchanged (and never returns a core);
 * - `winner != null` exactly when some hand is empty (move-only sequences);
 * - `turn` is monotonic.
 * A second property mixes in forfeits, where a last-standing winner may still hold cards.
 */
import assert from 'assert'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../shared/rng'
import { ALLOWED_RULES } from '../shared/rule-options'
import { type CardId, buildDeck, cardValue } from './cards'
import { engine } from './engine'
import { concatValue, isPrime } from './numbers'
import type { FactCardId, GameCore, Move, Pid, PrimeDaifugoSetupData, Rng } from './types'

const SEED = 20261125
const NUM_RUNS = 200

type Step =
  | { kind: 'draw'; wrongPlayer: boolean }
  | { kind: 'pass'; wrongPlayer: boolean }
  | { kind: 'timeout' }
  | { kind: 'forfeit'; seat: number }
  | { kind: 'smart'; preferFactor: boolean; pick: number }
  | {
      kind: 'submit'
      wrongPlayer: boolean
      picks: number[]
      factorPicks: number[]
      ops: boolean[]
      foreign: boolean
      duplicate: boolean
      factorMode: boolean
    }

const pickArb = fc.array(fc.nat(60), { minLength: 0, maxLength: 5 })

const moveStepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('draw' as const), wrongPlayer: fc.boolean() }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('pass' as const), wrongPlayer: fc.boolean() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('timeout' as const) }) },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('smart' as const),
      preferFactor: fc.boolean(),
      pick: fc.nat(60),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('submit' as const),
      wrongPlayer: fc.boolean(),
      picks: fc.array(fc.nat(60), { minLength: 0, maxLength: 4 }),
      factorPicks: pickArb,
      ops: fc.array(fc.boolean(), { minLength: 0, maxLength: 6 }),
      foreign: fc.boolean(),
      duplicate: fc.boolean(),
      factorMode: fc.boolean(),
    }),
  },
)

const forfeitStepArb: fc.Arbitrary<Step> = fc.record({
  kind: fc.constant('forfeit' as const),
  seat: fc.nat(3),
})

const ruleArb: fc.Arbitrary<PrimeDaifugoSetupData> = fc.record({
  timeLimit: fc.constantFrom(...ALLOWED_RULES.timeLimit),
  initNumCards: fc.constantFrom(...ALLOWED_RULES.initNumCards),
  maxSubmitNumCards: fc.constantFrom(...ALLOWED_RULES.maxSubmitNumCards),
  halfEvenNumbers: fc.boolean(),
})

const sorted = (cards: readonly CardId[]) => [...cards].sort()

const allCards = (core: GameCore): CardId[] =>
  sorted([
    ...Object.values(core.players).flatMap((p) => p.hand),
    ...core.field.flat(),
    ...core.deck,
  ])

/** Pick distinct hand cards by index (with occasional deliberate breakage). */
function choose(hand: readonly CardId[], picks: readonly number[]): CardId[] {
  const pool = [...hand]
  const out: CardId[] = []
  for (const pick of picks) {
    if (pool.length === 0) {
      break
    }
    out.push(pool.splice(pick % pool.length, 1)[0])
  }
  return out
}

/**
 * A move that is legal and usually correct: a 57 cut, a single prime card, or a single composite
 * card factorized as `p*q` or `p^k` with other hand cards. Falls back to a pass.
 */
function smartMove(core: GameCore, step: Extract<Step, { kind: 'smart' }>): Move {
  const hand = core.players[core.currentPlayer].hand
  const top = core.field.at(-1)
  const topValue = top ? Number(concatValue(top)) : 0
  const fives = hand.filter((card) => cardValue(card) === 5)
  const sevens = hand.filter((card) => cardValue(card) === 7)
  if ((!top || (top.length === 2 && topValue < 57)) && fives.length > 0 && sevens.length > 0) {
    return { type: 'submit', submit: [fives[0], sevens[0]], factor: [] }
  }
  if (top && top.length !== 1) {
    return { type: 'pass' }
  }
  const singles = hand.filter((card) => cardValue(card) > topValue)
  if (singles.length === 0) {
    return { type: 'pass' }
  }
  const factorized: Move[] = []
  const plain: Move[] = []
  for (const card of singles) {
    const v = cardValue(card)
    if (isPrime(BigInt(v))) {
      plain.push({ type: 'submit', submit: [card], factor: [] })
      continue
    }
    const others = hand.filter((other) => other !== card)
    for (const a of others) {
      for (const b of others) {
        if (a === b || !isPrime(BigInt(cardValue(a))) || cardValue(b) < 2) {
          continue
        }
        if (cardValue(a) * cardValue(b) === v && isPrime(BigInt(cardValue(b)))) {
          factorized.push({ type: 'submit', submit: [card], factor: [a, '*', b] })
        } else if (cardValue(a) ** cardValue(b) === v) {
          factorized.push({ type: 'submit', submit: [card], factor: [a, '^', b] })
        }
      }
    }
  }
  const first = step.preferFactor ? factorized : plain
  const second = step.preferFactor ? plain : factorized
  const options = first.length > 0 ? first : second
  return options.length > 0 ? options[step.pick % options.length] : { type: 'pass' }
}

/** Turn a step into a concrete (possibly illegal) move against `core`. */
function toMove(core: GameCore, step: Exclude<Step, { kind: 'timeout' | 'forfeit' }>): [Pid, Move] {
  if (step.kind === 'smart') {
    return [core.currentPlayer, smartMove(core, step)]
  }
  const others = core.playOrder.filter((pid) => pid !== core.currentPlayer)
  const by = step.wrongPlayer && others.length > 0 ? others[0] : core.currentPlayer
  if (step.kind !== 'submit') {
    return [by, { type: step.kind }]
  }
  const hand = core.players[core.currentPlayer].hand
  // aim for a legal count on a non-empty field most of the time
  const top = core.field.at(-1)
  const picks = top && step.picks.length > 0 ? step.picks.slice(0, top.length) : step.picks
  const submit = choose(hand, picks)
  const rest = hand.filter((card) => !submit.includes(card))
  const factorCards = step.factorMode ? choose(rest, step.factorPicks) : []
  const factor: FactCardId[] = []
  factorCards.forEach((card, i) => {
    if (i > 0) {
      // ops[i] true → '*', false → '^', missing → join digits
      const op = step.ops[i - 1]
      if (op !== undefined) {
        factor.push(op ? '*' : '^')
      }
    }
    factor.push(card)
  })
  if (step.foreign) {
    const foreign = core.deck.at(-1)
    if (foreign) {
      submit.push(foreign)
    }
  }
  if (step.duplicate && submit.length > 0) {
    submit.push(submit[0])
  }
  return [by, { type: 'submit', submit, factor }]
}

type Run = { rule: PrimeDaifugoSetupData; seats: number; seed: number; steps: Step[] }

/** Plays a run, checking every invariant after each step (node `assert`, so it runs inside fc). */
function playRun({ rule, seats, seed, steps }: Run, withForfeit: boolean): void {
  const rng: Rng = mulberry32(seed)
  const pids = ['p0', 'p1', 'p2', 'p3'].slice(0, seats)
  const setup = engine.setup(pids, rule, rng)
  if (!setup.ok) {
    // only 4 seats × 11 cards on the 40-card deck is too small
    assert.equal(setup.reason, 'deck-too-small')
    assert.ok(rule.halfEvenNumbers && seats * rule.initNumCards > 40)
    return
  }
  const initialDeck = sorted(buildDeck(rule))
  let core = setup.core
  assert.deepStrictEqual(allCards(core), initialDeck)

  for (const step of steps) {
    const before = structuredClone(core)
    let next: GameCore
    if (step.kind === 'timeout') {
      next = engine.timeoutPass(core, rng).core
    } else if (step.kind === 'forfeit') {
      const pid = pids[step.seat % pids.length]
      next = engine.forfeit(core, pid, rng).core
    } else {
      const [by, move] = toMove(core, step)
      const result = engine.applyMove(core, by, move, rng)
      if (!result.ok) {
        // rejected: no core returned, input untouched
        assert.ok(!('core' in result))
        assert.deepStrictEqual(core, before)
        continue
      }
      next = result.core
    }
    // the input is never mutated, even on success
    assert.deepStrictEqual(core, before)

    assert.deepStrictEqual(allCards(next), initialDeck)
    assert.ok(next.playOrder.includes(next.currentPlayer))
    assert.ok(next.turn >= core.turn)
    const someHandEmpty = Object.values(next.players).some((p) => p.hand.length === 0)
    if (withForfeit) {
      if (next.winner !== null) {
        assert.ok(next.players[next.winner].hand.length === 0 || next.playOrder.length === 1)
      }
      if (someHandEmpty) {
        assert.notEqual(next.winner, null)
      }
    } else {
      assert.equal(next.winner !== null, someHandEmpty)
    }
    if (core.winner !== null) {
      assert.deepStrictEqual(next, core)
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(next)), next)
    core = next
  }
}

const runArb = (step: fc.Arbitrary<Step>): fc.Arbitrary<Run> =>
  fc.record({
    rule: ruleArb,
    seats: fc.integer({ min: 2, max: 4 }),
    seed: fc.integer(),
    steps: fc.array(step, { minLength: 1, maxLength: 80 }),
  })

describe('engine properties (fast-check, seeded)', () => {
  it('move-only sequences keep every invariant', () => {
    fc.assert(
      fc.property(runArb(moveStepArb), (run) => playRun(run, false)),
      { seed: SEED, numRuns: NUM_RUNS },
    )
  })

  it('sequences with forfeits keep conservation, order and turn invariants', () => {
    const step = fc.oneof(
      { weight: 12, arbitrary: moveStepArb },
      { weight: 1, arbitrary: forfeitStepArb },
    )
    fc.assert(
      fc.property(runArb(step), (run) => playRun(run, true)),
      { seed: SEED + 1, numRuns: NUM_RUNS },
    )
  })

  it('the generators reach accepted submits, penalties, 57 cuts and wins', () => {
    const seen = { success: 0, penalty: 0, factor: 0, cut57: 0, ended: 0 }
    fc.assert(
      fc.property(runArb(moveStepArb), ({ rule, seats, seed, steps }) => {
        const rng = mulberry32(seed)
        const setup = engine.setup(['a', 'b', 'c', 'd'].slice(0, seats), rule, rng)
        if (!setup.ok) {
          return
        }
        let core = setup.core
        for (const step of steps) {
          if (step.kind !== 'submit' && step.kind !== 'smart') {
            continue
          }
          const [by, move] = toMove(
            core,
            step.kind === 'smart'
              ? step
              : { ...step, wrongPlayer: false, foreign: false, duplicate: false },
          )
          const result = engine.applyMove(core, by, move, rng)
          if (result.ok && result.outcome.kind === 'submitted') {
            if (result.outcome.result === null) {
              seen.success += 1
              if (move.type === 'submit' && move.factor.length > 0) {
                seen.factor += 1
              }
            } else {
              seen.penalty += 1
            }
            if (result.outcome.cut57) {
              seen.cut57 += 1
            }
            if (result.outcome.ended) {
              seen.ended += 1
              return
            }
          }
          if (result.ok) {
            core = result.core
          }
        }
      }),
      { seed: SEED + 2, numRuns: NUM_RUNS },
    )
    expect(seen.success).toBeGreaterThan(0)
    expect(seen.penalty).toBeGreaterThan(0)
    expect(seen.factor).toBeGreaterThan(0)
    expect(seen.cut57).toBeGreaterThan(0)
    expect(seen.ended).toBeGreaterThan(0)
  })
})
