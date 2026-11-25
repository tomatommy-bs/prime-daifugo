/**
 * New engine tests (spec §7.4 "New tests", RQ-R6..RQ-R20, forfeit §3.6).
 * Ported cases live in `engine.ported.test.ts`; invariants in `engine.property.test.ts`.
 */
import assert from 'assert'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../shared/rng'
import { type CardId, FULL_DECK, buildDeck } from './cards'
import { engine } from './engine'
import type { FactCardId, GameCore, Move, Pid, PrimeDaifugoSetupData } from './types'

const RULE: PrimeDaifugoSetupData = {
  initNumCards: 11,
  maxSubmitNumCards: 4,
  timeLimit: 60,
  halfEvenNumbers: false,
}

const rng = () => mulberry32(42)

type CoreInit = {
  hands: Record<Pid, CardId[]>
  field?: CardId[][]
  deck?: CardId[]
  current?: Pid
  deckTopPlayer?: Pid | null
  rule?: Partial<PrimeDaifugoSetupData>
  turn?: number
  drawRight?: Record<Pid, boolean>
}

/** A hand-built core. The deck defaults to every card not in a hand or on the field. */
function makeCore(init: CoreInit): GameCore {
  const playOrder = Object.keys(init.hands)
  const field = init.field ?? []
  const used = new Set<CardId>([...Object.values(init.hands).flat(), ...field.flat()])
  const deck = init.deck ?? FULL_DECK.filter((card) => !used.has(card))
  const players: GameCore['players'] = {}
  for (const pid of playOrder) {
    players[pid] = { hand: [...init.hands[pid]], drawRight: init.drawRight?.[pid] ?? true }
  }
  return {
    rule: { ...RULE, ...init.rule },
    playOrder,
    currentPlayer: init.current ?? playOrder[0],
    turn: init.turn ?? 0,
    players,
    deck,
    field: field.map((set) => [...set]),
    deckTopPlayer: init.deckTopPlayer ?? null,
    lastResult: null,
    winner: null,
  }
}

const allCards = (core: GameCore): CardId[] =>
  [...Object.values(core.players).flatMap((p) => p.hand), ...core.field.flat(), ...core.deck].sort()

const submit = (cards: CardId[], factor: FactCardId[] = []): Move => ({
  type: 'submit',
  submit: cards,
  factor,
})

/** Apply and expect acceptance; also checks the input was not mutated. */
function accept(core: GameCore, by: Pid, move: Move, seed = 1) {
  const before = structuredClone(core)
  const result = engine.applyMove(core, by, move, mulberry32(seed))
  assert.deepStrictEqual(core, before)
  if (!result.ok) {
    throw new Error(`rejected: ${result.reason}`)
  }
  return result
}

/** Apply and expect a rejection with `reason`; the input stays deep-equal. */
function reject(core: GameCore, by: Pid, move: Move, reason: string) {
  const before = structuredClone(core)
  const result = engine.applyMove(core, by, move, rng())
  assert.deepStrictEqual(result, { ok: false, reason })
  assert.deepStrictEqual(core, before)
}

describe('engine', () => {
  describe('setup (RQ-R6, RQ-R7)', () => {
    it('rejects fewer than 2, more than 4, or repeated seats', () => {
      expect(engine.setup(['a'], RULE, rng())).toEqual({ ok: false, reason: 'bad-player-count' })
      expect(engine.setup(['a', 'b', 'c', 'd', 'e'], RULE, rng())).toEqual({
        ok: false,
        reason: 'bad-player-count',
      })
      expect(engine.setup(['a', 'a'], RULE, rng())).toEqual({
        ok: false,
        reason: 'bad-player-count',
      })
    })

    it('checks the deck size against initNumCards × seats', () => {
      // 40 cards < 11 × 4
      expect(engine.setup(['a', 'b', 'c', 'd'], { ...RULE, halfEvenNumbers: true }, rng())).toEqual(
        {
          ok: false,
          reason: 'deck-too-small',
        },
      )
      // 40 cards ≥ 11 × 3
      expect(engine.setup(['a', 'b', 'c'], { ...RULE, halfEvenNumbers: true }, rng()).ok).toBe(true)
      // 52 ≥ 44: an exact-ish fit deals and leaves 8
      const result = engine.setup(['a', 'b', 'c', 'd'], RULE, rng())
      expect(result.ok ? result.core.deck : null).toHaveLength(8)
    })

    it('deals initNumCards to each seat in the given order with drawRight', () => {
      const seats = ['p3', 'p1', 'p2']
      const result = engine.setup(seats, { ...RULE, initNumCards: 8 }, rng())
      if (!result.ok) {
        throw new Error('setup failed')
      }
      const { core } = result
      expect(core.playOrder).toEqual(['p3', 'p1', 'p2'])
      expect(core.currentPlayer).toBe('p3')
      expect(core.turn).toBe(0)
      expect(core.field).toEqual([])
      expect(core.deckTopPlayer).toBeNull()
      expect(core.winner).toBeNull()
      expect(core.lastResult).toBeNull()
      expect(core.rule).toEqual({ ...RULE, initNumCards: 8 })
      for (const pid of seats) {
        expect(core.players[pid]).toEqual({ hand: expect.any(Array), drawRight: true })
        expect(core.players[pid].hand).toHaveLength(8)
      }
      expect(core.deck).toHaveLength(52 - 24)
      expect(allCards(core)).toEqual([...FULL_DECK].sort())
      expect(seats).toEqual(['p3', 'p1', 'p2'])
      expect(core).not.toHaveProperty('leftTime')
    })

    it('uses the half-even deck', () => {
      const result = engine.setup(['a', 'b'], { ...RULE, halfEvenNumbers: true }, rng())
      expect(result.ok && allCards(result.core)).toEqual(
        buildDeck({ halfEvenNumbers: true }).sort(),
      )
    })

    it('is deterministic for a seed and differs across seeds (RQ-R20)', () => {
      const a = engine.setup(['a', 'b'], RULE, mulberry32(7))
      const b = engine.setup(['a', 'b'], RULE, mulberry32(7))
      const c = engine.setup(['a', 'b'], RULE, mulberry32(8))
      expect(a).toEqual(b)
      expect(a).not.toEqual(c)
    })

    it('a game exported to JSON and re-imported continues identically (RQ-R20)', () => {
      const result = engine.setup(['a', 'b', 'c'], RULE, mulberry32(3))
      if (!result.ok) {
        throw new Error('setup failed')
      }
      const imported: GameCore = JSON.parse(JSON.stringify(result.core))
      expect(imported).toEqual(result.core)
      const moves: [Pid, Move][] = [
        ['a', { type: 'draw' }],
        ['a', { type: 'pass' }],
        ['b', { type: 'pass' }],
      ]
      let x = result.core
      let y = imported
      const rx = mulberry32(5)
      const ry = mulberry32(5)
      for (const [by, move] of moves) {
        const nx = engine.applyMove(x, by, move, rx)
        const ny = engine.applyMove(y, by, move, ry)
        expect(ny).toEqual(nx)
        if (!(nx.ok && ny.ok)) {
          throw new Error('rejected')
        }
        x = nx.core
        y = ny.core
      }
    })
  })

  describe('turn ownership (RQ-R8)', () => {
    it('rejects draw, pass and submit from anyone but the current player', () => {
      const core = makeCore({ hands: { a: ['2S', '3S'], b: ['5S', '7S'] } })
      reject(core, 'b', { type: 'draw' }, 'not-your-turn')
      reject(core, 'b', { type: 'pass' }, 'not-your-turn')
      reject(core, 'b', submit(['5S']), 'not-your-turn')
      reject(core, 'zz', { type: 'pass' }, 'not-your-turn')
    })

    it('rejects an unknown move type', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] } })
      reject(core, 'a', { type: 'shout' } as unknown as Move, 'invalid-move')
    })
  })

  describe('draw (RQ-R9)', () => {
    it('takes the last deck card, keeps the turn and spends the draw right', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] }, deck: ['9H', 'KD'] })
      const { core: next, outcome } = accept(core, 'a', { type: 'draw' })
      expect(outcome).toEqual({ kind: 'drew' })
      expect(next.players.a.hand).toEqual(['2S', 'KD'])
      expect(next.deck).toEqual(['9H'])
      expect(next.players.a.drawRight).toBe(false)
      expect(next.currentPlayer).toBe('a')
      expect(next.turn).toBe(0)
    })

    it('rejects a draw on an empty deck', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] }, deck: [] })
      reject(core, 'a', { type: 'draw' }, 'deck-empty')
    })

    it('rejects a second draw in the same turn (state unchanged, drawRight included)', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] } })
      const { core: afterDraw } = accept(core, 'a', { type: 'draw' })
      reject(afterDraw, 'a', { type: 'draw' }, 'already-drawn')
      expect(afterDraw.players.a.drawRight).toBe(false)
    })

    it('a pass and a judged submit restore the draw right', () => {
      const core = makeCore({ hands: { a: ['2S', '4S'], b: ['5S'] } })
      const { core: drew } = accept(core, 'a', { type: 'draw' })
      expect(accept(drew, 'a', { type: 'pass' }).core.players.a.drawRight).toBe(true)
      const { core: drew2 } = accept(core, 'a', { type: 'draw' })
      expect(accept(drew2, 'a', submit(['4S'])).core.players.a.drawRight).toBe(true)
      expect(accept(drew2, 'a', submit(['2S'])).core.players.a.drawRight).toBe(true)
    })
  })

  describe('pass and flow (RQ-R10, RQ-R11)', () => {
    it('a pass on an empty field moves the turn and increments turn', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] } })
      const { core: next, outcome } = accept(core, 'a', { type: 'pass' })
      expect(outcome).toEqual({ kind: 'passed', flowed: false })
      expect(next.currentPlayer).toBe('b')
      expect(next.turn).toBe(1)
      expect(next.field).toEqual([])
    })

    it('3 players: the field flows when the turn returns to the deck-top player', () => {
      let core = makeCore({ hands: { a: ['2S', '9S'], b: ['5S', '4H'], c: ['7S', '8H'] } })
      core = accept(core, 'a', submit(['2S'])).core
      expect(core.deckTopPlayer).toBe('a')
      core = accept(core, 'b', { type: 'pass' }).core
      expect(core.field).toEqual([['2S']])
      const last = accept(core, 'c', { type: 'pass' })
      expect(last.outcome).toEqual({ kind: 'passed', flowed: true })
      expect(last.core.field).toEqual([])
      expect(last.core.deckTopPlayer).toBeNull()
      expect(last.core.currentPlayer).toBe('a')
      expect(last.core.turn).toBe(3)
      expect(allCards(last.core)).toEqual(allCards(core))
    })

    it('4 players: failures count toward the rotation and the deck-top leads after the flow', () => {
      let core = makeCore({
        hands: { a: ['3S', 'KS'], b: ['4S', '6H'], c: ['8S', 'KH'], d: ['9S', 'QH'] },
      })
      core = accept(core, 'a', submit(['3S'])).core
      const failB = accept(core, 'b', submit(['4S']))
      expect(failB.outcome).toMatchObject({ result: 'BASE_IS_NOT_PRIME', flowed: false })
      core = accept(failB.core, 'c', submit(['8S'])).core
      expect(core.lastResult).toBe('BASE_IS_NOT_PRIME')
      const passD = accept(core, 'd', { type: 'pass' })
      expect(passD.outcome).toEqual({ kind: 'passed', flowed: true })
      expect(passD.core.currentPlayer).toBe('a')
      expect(passD.core.field).toEqual([])
      expect(passD.core.turn).toBe(4)
    })

    it('a new deck top resets the rotation', () => {
      let core = makeCore({ hands: { a: ['2S', '9S'], b: ['5S', '4H'], c: ['7S', '8H'] } })
      core = accept(core, 'a', submit(['2S'])).core
      core = accept(core, 'b', submit(['5S'])).core
      core = accept(core, 'c', { type: 'pass' }).core
      // back at a: b holds the deck top, so no flow yet
      expect(core.field).toEqual([['2S'], ['5S']])
      const passA = accept(core, 'a', { type: 'pass' })
      expect(passA.outcome).toEqual({ kind: 'passed', flowed: true })
      expect(passA.core.currentPlayer).toBe('b')
    })
  })

  describe('submit validation (RQ-R12): rejected with no state change', () => {
    const base = () =>
      makeCore({
        hands: { a: ['2S', '3S', '5S', '7S', 'JS', 'KS', '4C'], b: ['2H', '3H'] },
        rule: { maxSubmitNumCards: 4 },
      })

    it('empty submit', () => {
      reject(base(), 'a', submit([]), 'invalid-move')
      reject(base(), 'a', { type: 'submit' } as unknown as Move, 'invalid-move')
    })

    it('more than maxSubmitNumCards', () => {
      reject(base(), 'a', submit(['2S', '3S', '5S', '7S', 'JS']), 'invalid-move')
    })

    it('cards not in hand (submit or factor) and non-card tokens', () => {
      reject(base(), 'a', submit(['9D']), 'invalid-move')
      reject(base(), 'a', submit(['KS'], ['9D', '*', '2S']), 'invalid-move')
      reject(base(), 'a', submit(['*' as CardId]), 'invalid-move')
      reject(base(), 'a', submit(['KS'], ['ZZ' as CardId, '*', '2S']), 'invalid-move')
    })

    it('duplicate ids in submit, in factor and across both', () => {
      reject(base(), 'a', submit(['3S', '3S']), 'invalid-move')
      reject(base(), 'a', submit(['4C'], ['2S', '*', '2S']), 'invalid-move')
      reject(base(), 'a', submit(['4C'], ['4C', '*', '2S']), 'invalid-move')
    })

    it('on a non-empty field: count must match and the value must be strictly greater', () => {
      const core = makeCore({
        hands: { a: ['2S', '3S', '5S', '7S', 'JS', 'KS', '4C'], b: ['2H', '3H'] },
        field: [['JH']],
        deckTopPlayer: 'b',
      })
      reject(core, 'a', submit(['2S', '3S']), 'invalid-move')
      reject(core, 'a', submit(['7S']), 'invalid-move')
      reject(core, 'a', submit(['JS']), 'invalid-move') // equal is not greater
      expect(accept(core, 'a', submit(['KS'])).outcome).toMatchObject({ result: null })
    })

    it('malformed factor expressions: invalid-fact (tower, exponent 1, dangling operator)', () => {
      const core = makeCore({
        hands: { a: ['8S', '2S', '3S', '2C', 'AH', '4S'], b: ['2H'] },
        rule: { maxSubmitNumCards: 52 },
      })
      // a single-level power is well formed: 2^3 = 8
      expect(accept(core, 'a', submit(['8S'], ['2S', '^', '3S'])).outcome).toMatchObject({
        result: null,
      })
      reject(core, 'a', submit(['4S'], ['2S', '^', '2C', '^', 'AH']), 'invalid-fact')
      reject(core, 'a', submit(['2C'], ['2S', '^', 'AH']), 'invalid-fact')
      reject(core, 'a', submit(['4S'], ['2S', '*']), 'invalid-fact')
    })

    it('validation order: hand check before field check before factor syntax', () => {
      const core = makeCore({
        hands: { a: ['2S', '3S', '5S'], b: ['2H'] },
        field: [['9H']],
        deckTopPlayer: 'b',
      })
      // malformed factor and lower value: the field check wins
      reject(core, 'a', submit(['5S'], ['2S', '*']), 'invalid-move')
      // malformed factor with a foreign card: the hand check wins
      reject(core, 'a', submit(['5S'], ['KD', '*']), 'invalid-move')
    })
  })

  describe('judging, success and penalties (RQ-R13..RQ-R15)', () => {
    it('success: cards to the field as one set, deck top set, turn moves', () => {
      const core = makeCore({ hands: { a: ['AS', '3S', '9S'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['AS', '3S']))
      expect(outcome).toEqual({
        kind: 'submitted',
        result: null,
        cut57: false,
        flowed: false,
        penalty: 0,
        ended: false,
      })
      expect(next.field).toEqual([['AS', '3S']])
      expect(next.players.a.hand).toEqual(['9S'])
      expect(next.deckTopPlayer).toBe('a')
      expect(next.currentPlayer).toBe('b')
      expect(next.lastResult).toBeNull()
      expect(next.turn).toBe(1)
      expect(next.deck).toEqual(core.deck)
    })

    it('factor success: factor cards go back into the reshuffled deck', () => {
      const core = makeCore({ hands: { a: ['6C', '2D', '3H', '9S'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['6C'], ['2D', '*', '3H']))
      expect(outcome).toMatchObject({ result: null, penalty: 0 })
      expect(next.players.a.hand).toEqual(['9S'])
      expect(next.deck).toHaveLength(core.deck.length + 2)
      expect(next.deck).toEqual(expect.arrayContaining(['2D', '3H']))
      expect(allCards(next)).toEqual(allCards(core))
    })

    it('BASE_IS_NOT_PRIME draws submit.length cards from the END of the deck', () => {
      const core = makeCore({
        hands: { a: ['AS', '2S', '9S'], b: ['2H'] },
        deck: ['3D', '4D', '5D'],
      })
      const { core: next, outcome } = accept(core, 'a', submit(['AS', '2S']))
      expect(outcome).toMatchObject({ result: 'BASE_IS_NOT_PRIME', penalty: 2, cut57: false })
      expect(next.players.a.hand).toEqual(['AS', '2S', '9S', '5D', '4D'])
      expect(next.deck).toEqual(['3D'])
      expect(next.field).toEqual([])
      expect(next.deckTopPlayer).toBeNull()
      expect(next.lastResult).toBe('BASE_IS_NOT_PRIME')
      expect(next.currentPlayer).toBe('b')
    })

    it('a factor failure draws submit.length plus the factor card count', () => {
      const core = makeCore({ hands: { a: ['8H', '2D', '3H', '9S'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['8H'], ['2D', '*', '3H']))
      expect(outcome).toMatchObject({ result: 'INCORRECT_ANSWER', penalty: 3 })
      expect(next.players.a.hand).toHaveLength(4 + 3)
      const notPrime = makeCore({ hands: { a: ['8H', '2D', '4C', '9S'], b: ['2H'] } })
      expect(accept(notPrime, 'a', submit(['8H'], ['2D', '*', '4C'])).outcome).toMatchObject({
        result: 'FACT_CONTAIN_NOT_PRIME',
        penalty: 3,
      })
    })

    it('INCORRECT_ANSWER wins when both factor checks fail', () => {
      const core = makeCore({ hands: { a: ['9H', '2D', '4C'], b: ['2H'] } })
      expect(accept(core, 'a', submit(['9H'], ['2D', '*', '4C'])).outcome).toMatchObject({
        result: 'INCORRECT_ANSWER',
      })
    })

    it('a short deck: the player draws what is left', () => {
      const core = makeCore({ hands: { a: ['8H', '2D', '3H'], b: ['2H'] }, deck: ['KD'] })
      const { core: next, outcome } = accept(core, 'a', submit(['8H'], ['2D', '*', '3H']))
      expect(outcome).toMatchObject({ result: 'INCORRECT_ANSWER', penalty: 1 })
      expect(next.deck).toEqual([])
      expect(next.players.a.hand).toEqual(['8H', '2D', '3H', 'KD'])
    })

    it('numbers of 30 cards are judged exactly (BigInt)', () => {
      const prime30: CardId[] = [
        ...(['AS', '7D', '3C', '2D', 'JS', '6D', 'JD', '8D', 'JC', '9H'] as const),
        ...(['3D', '2S', '10H', '6S', 'QD', '3S', '9C', 'KH', 'KS', 'AH'] as const),
        ...(['3H', '6C', '5C', '8C', '2H', '5D', '7C', '5S', 'AC', 'KC'] as const),
      ]
      const core = makeCore({
        hands: { a: [...prime30, '4S'], b: ['4H'] },
        rule: { maxSubmitNumCards: 52 },
      })
      const ok = accept(core, 'a', submit(prime30))
      expect(ok.outcome).toMatchObject({ result: null })
      expect(ok.core.players.a.hand).toEqual(['4S'])
      // swap the last card for an even one: composite, 30-card penalty from a short deck
      const even = [...prime30.slice(0, 29), '4S'] as CardId[]
      const bad = accept(core, 'a', submit(even))
      expect(bad.outcome).toMatchObject({
        result: 'BASE_IS_NOT_PRIME',
        penalty: core.deck.length,
      })
      expect(bad.core.deck).toEqual([])
    })

    it('factor mode with a big exponent short-circuits (no huge power computed)', () => {
      const core = makeCore({
        hands: { a: ['8S', '2S', 'KS', 'KH', 'KC', 'KD'], b: ['2H'] },
        rule: { maxSubmitNumCards: 52 },
      })
      const { outcome } = accept(core, 'a', submit(['8S'], ['2S', '^', 'KS', 'KH', 'KC', 'KD']))
      expect(outcome).toMatchObject({ result: 'INCORRECT_ANSWER', penalty: 6 })
    })
  })

  describe('57 cut (RQ-R17)', () => {
    it('plain 57 on an empty field keeps the turn, flows at once and increments turn', () => {
      const core = makeCore({ hands: { a: ['5S', '7S', '9S'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['5S', '7S']))
      expect(outcome).toEqual({
        kind: 'submitted',
        result: null,
        cut57: true,
        flowed: true,
        penalty: 0,
        ended: false,
      })
      expect(next.currentPlayer).toBe('a')
      expect(next.turn).toBe(1)
      expect(next.field).toEqual([])
      expect(next.deckTopPlayer).toBeNull()
      expect(next.deck).toHaveLength(core.deck.length + 2)
    })

    it('57 on a non-empty field', () => {
      const core = makeCore({
        hands: { a: ['5S', '7S', '9S'], b: ['2H'] },
        field: [['4H', '3H']],
        deckTopPlayer: 'b',
      })
      const { core: next, outcome } = accept(core, 'a', submit(['5S', '7S']))
      expect(outcome).toMatchObject({ cut57: true, flowed: true })
      expect(next.currentPlayer).toBe('a')
      expect(next.field).toEqual([])
      expect(next.deck).toHaveLength(core.deck.length + 4)
    })

    it('3*19 in factor mode cuts', () => {
      const core = makeCore({ hands: { a: ['5S', '7S', '3S', 'AS', '9S', 'KD'], b: ['2H'] } })
      const { core: next, outcome } = accept(
        core,
        'a',
        submit(['5S', '7S'], ['3S', '*', 'AS', '9S']),
      )
      expect(outcome).toMatchObject({ result: null, cut57: true, flowed: true })
      expect(next.currentPlayer).toBe('a')
      expect(next.players.a.hand).toEqual(['KD'])
    })

    it('a failed 57 does not keep the turn', () => {
      const core = makeCore({ hands: { a: ['5S', '7S', '3S', 'AS', '7H', 'KD'], b: ['2H'] } })
      const { core: next, outcome } = accept(
        core,
        'a',
        submit(['5S', '7S'], ['3S', '*', 'AS', '7H']),
      )
      expect(outcome).toMatchObject({ result: 'INCORRECT_ANSWER', cut57: false, flowed: false })
      expect(next.currentPlayer).toBe('b')
    })

    it('57 as the winning play (on a non-empty field)', () => {
      const core = makeCore({
        hands: { a: ['5S', '7S'], b: ['2H'] },
        field: [['4H', '3H']],
        deckTopPlayer: 'b',
      })
      const { core: next, outcome } = accept(core, 'a', submit(['5S', '7S']))
      expect(outcome).toMatchObject({ result: null, cut57: true, flowed: true, ended: true })
      expect(next.winner).toBe('a')
      expect(next.field).toEqual([])
    })
  })

  describe('end of game (RQ-R18, RQ-R19)', () => {
    it('emptying the hand wins; the winner is set before the flow resets deckTopPlayer', () => {
      const core = makeCore({ hands: { a: ['5S', '7S'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['5S', '7S']))
      expect(outcome).toMatchObject({ cut57: true, flowed: true, ended: true })
      expect(next.winner).toBe('a')
      expect(next.deckTopPlayer).toBeNull()
    })

    it('a plain winning submit', () => {
      const core = makeCore({ hands: { a: ['KS'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['KS']))
      expect(outcome).toMatchObject({ result: null, ended: true, cut57: false })
      expect(next.winner).toBe('a')
      expect(next.players.a.hand).toEqual([])
    })

    it('a winning factor submit', () => {
      const core = makeCore({ hands: { a: ['6C', '2D', '3H'], b: ['2H'] } })
      const { core: next, outcome } = accept(core, 'a', submit(['6C'], ['2D', '*', '3H']))
      expect(outcome).toMatchObject({ ended: true })
      expect(next.winner).toBe('a')
    })

    it('after the end every move is bad-status', () => {
      const core = makeCore({ hands: { a: ['KS'], b: ['2H'] } })
      const { core: ended } = accept(core, 'a', submit(['KS']))
      reject(ended, 'b', { type: 'pass' }, 'bad-status')
      reject(ended, 'b', { type: 'draw' }, 'bad-status')
      reject(ended, 'a', submit(['2H']), 'bad-status')
      // timeoutPass changes nothing after the end
      const timed = engine.timeoutPass(ended, rng())
      expect(timed).toEqual({ core: ended, outcome: { kind: 'passed', flowed: false } })
    })
  })

  describe('timeoutPass (RQ-T2)', () => {
    it('equals a manual pass by the current player, flow included', () => {
      let core = makeCore({ hands: { a: ['2S', '9S'], b: ['5S', '4H'] } })
      core = accept(core, 'a', submit(['2S'])).core
      const before = structuredClone(core)
      const manual = engine.applyMove(core, 'b', { type: 'pass' }, mulberry32(9))
      const timed = engine.timeoutPass(core, mulberry32(9))
      expect(core).toEqual(before)
      expect(manual).toEqual({ ok: true, ...timed })
      expect(timed.outcome).toEqual({ kind: 'passed', flowed: true })
    })

    it('restores the draw right of the timed-out player', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['5S'] }, drawRight: { a: false } })
      expect(engine.timeoutPass(core, rng()).core.players.a.drawRight).toBe(true)
    })
  })

  describe('forfeit (spec §3.6)', () => {
    const four = () =>
      makeCore({
        hands: { a: ['2S', '3S'], b: ['4S', '5S'], c: ['6S', '7S'], d: ['8S', '9S'] },
      })

    it('a non-current, non-deck-top seat: hand to the deck, leaves playOrder, turn unchanged', () => {
      const core = four()
      const before = structuredClone(core)
      const { core: next, flowed, ended } = engine.forfeit(core, 'c', rng())
      expect(core).toEqual(before)
      expect(flowed).toBe(false)
      expect(ended).toBe(false)
      expect(next.playOrder).toEqual(['a', 'b', 'd'])
      expect(next.players).not.toHaveProperty('c')
      expect(next.deck).toHaveLength(core.deck.length + 2)
      expect(next.currentPlayer).toBe('a')
      expect(next.turn).toBe(0)
      expect(allCards(next)).toEqual(allCards(core))
    })

    it('the current player: the turn moves to the next remaining seat', () => {
      const core = makeCore({
        hands: { a: ['2S', '3S'], b: ['4S', '5S'], c: ['6S', '7S'], d: ['8S', '9S'] },
        current: 'b',
        turn: 5,
      })
      const { core: next, flowed } = engine.forfeit(core, 'b', rng())
      expect(flowed).toBe(false)
      expect(next.currentPlayer).toBe('c')
      expect(next.turn).toBe(6)
    })

    it('the current player at the end of playOrder wraps to the first seat', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['4S'], c: ['6S'] }, current: 'c' })
      expect(engine.forfeit(core, 'c', rng()).core.currentPlayer).toBe('a')
    })

    it('the deck-top player: the field flows immediately and the current player leads', () => {
      const core = makeCore({
        hands: { a: ['2S', '3S'], b: ['4S', '5S'], c: ['6S', '7S'] },
        field: [['KH']],
        deckTopPlayer: 'a',
        current: 'b',
      })
      const { core: next, flowed, ended } = engine.forfeit(core, 'a', rng())
      expect(flowed).toBe(true)
      expect(ended).toBe(false)
      expect(next.field).toEqual([])
      expect(next.deckTopPlayer).toBeNull()
      expect(next.currentPlayer).toBe('b')
      expect(next.turn).toBe(0)
      expect(allCards(next)).toEqual(allCards(core))
    })

    it('the current player whose next seat holds the deck top: the field flows (RQ-R11)', () => {
      const core = makeCore({
        hands: { a: ['2S', '3S'], b: ['4S', '5S'], c: ['6S', '7S'] },
        field: [['KH']],
        deckTopPlayer: 'a',
        current: 'c',
      })
      const { core: next, flowed } = engine.forfeit(core, 'c', rng())
      expect(flowed).toBe(true)
      expect(next.currentPlayer).toBe('a')
      expect(next.field).toEqual([])
    })

    it('down to the last standing seat, which wins', () => {
      let core = four()
      const initial = allCards(core)
      for (const pid of ['a', 'c']) {
        const step = engine.forfeit(core, pid, rng())
        expect(step.ended).toBe(false)
        core = step.core
        expect(allCards(core)).toEqual(initial)
        expect(core.playOrder).toContain(core.currentPlayer)
      }
      const last = engine.forfeit(core, 'd', rng())
      expect(last.ended).toBe(true)
      expect(last.core.winner).toBe('b')
      expect(last.core.playOrder).toEqual(['b'])
      expect(allCards(last.core)).toEqual(initial)
      reject(last.core, 'b', { type: 'pass' }, 'bad-status')
    })

    it('two players: the current player forfeits and the other wins', () => {
      const core = makeCore({ hands: { a: ['2S'], b: ['4S'] } })
      const { core: next, ended } = engine.forfeit(core, 'a', rng())
      expect(ended).toBe(true)
      expect(next.winner).toBe('b')
      expect(next.currentPlayer).toBe('b')
    })

    it('an unseated pid or a finished game is left unchanged', () => {
      const core = four()
      expect(engine.forfeit(core, 'zz', rng())).toEqual({ core, flowed: false, ended: false })
      const ended = engine.forfeit(makeCore({ hands: { a: ['2S'], b: ['4S'] } }), 'a', rng()).core
      expect(engine.forfeit(ended, 'b', rng())).toEqual({ core: ended, flowed: false, ended: true })
    })
  })
})
