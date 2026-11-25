import { DUR, EASE } from '@/design/motion'
import type { CardId } from '@/game-card/src'
import { makeClientCtx, makeClientGameState } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import type { GameState } from './classify-transition'
import {
  GROUP_STAGGER,
  MAX_FLIGHTS,
  PENALTY_DELAY,
  arrivedCards,
  arrivedCount,
  flightsFor,
  planDuration,
  planFlights,
} from './flight-plan'

/** A UI state as `viewer` sees it: own hand by id, every other hand by count only (§9.3). */
const snap = ({
  hands = { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH'] },
  field = [],
  current = 'p1',
  viewer = 'p1',
}: {
  hands?: Record<string, string[]>
  field?: string[][]
  current?: string
  viewer?: string
} = {}): GameState => ({
  gameState: makeClientGameState({
    players: Object.fromEntries(
      Object.entries(hands).map(([id, hand]) => [
        id,
        { hand: id === viewer ? (hand as CardId[]) : [], handCount: hand.length },
      ]),
    ),
    field: field as CardId[][],
  }),
  ctx: makeClientCtx({ playOrder: Object.keys(hands), currentPlayer: current }),
})

const ctxOf = (prev: GameState | null, next: GameState, selfId = 'p1') => ({ selfId, prev, next })

describe('arrivedCards / arrivedCount', () => {
  it('lists the cards new to my hand, in hand order (an id diff)', () => {
    const prev = snap()
    const next = snap({ hands: { p1: ['AS', '3H', '4S', 'JD', '9S'], p2: ['2S', '5C', 'KH'] } })
    expect(arrivedCards(prev, next, 'p1')).toEqual(['4S', '9S'])
    expect(arrivedCount(prev, next, 'p1', 'p1')).toBe(2)
    expect(arrivedCards(prev, next, 'p2')).toEqual([])
    expect(arrivedCount(prev, next, 'p2', 'p1')).toBe(0)
  })

  it("others' hands carry no ids: their arrivals are the handCount delta", () => {
    const prev = snap()
    const next = snap({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH', '4S', '9S'] } })
    expect(next.gameState.players.p2.hand).toEqual([])
    expect(arrivedCards(prev, next, 'p2')).toEqual([])
    expect(arrivedCount(prev, next, 'p2', 'p1')).toBe(2)
    // a shrinking hand never counts as an arrival; nothing before the first state
    expect(arrivedCount(next, prev, 'p2', 'p1')).toBe(0)
    expect(arrivedCount(null, next, 'p2', 'p1')).toBe(5)
    expect(arrivedCount(prev, next, 'nobody', 'p1')).toBe(0)
  })
})

describe('flightsFor', () => {
  it('my draw: a back leaves the deck and lands face up in its hand slot (flip, 40px arc)', () => {
    const prev = snap()
    const next = snap({ hands: { p1: ['AS', '3H', '4S', 'JD'], p2: ['2S', '5C', 'KH'] } })
    const [f, ...rest] = flightsFor({ type: 'draw', who: 'me', playerId: 'p1' }, ctxOf(prev, next))
    expect(rest).toEqual([])
    expect(f).toMatchObject({
      from: { kind: 'deck' },
      to: { kind: 'hand-card', card: '4S' },
      fallback: { kind: 'hand' },
      path: 'arc',
      face: 'Back',
      faceTo: '4S',
      duration: DUR.lg,
      ease: EASE.inOut,
      hideTarget: true,
      absorb: false,
    })
  })

  it("an opponent's draw: a back is absorbed by their seat, nothing is hidden", () => {
    const prev = snap()
    const next = snap({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', '9S', 'KH'] } })
    const flights = flightsFor({ type: 'draw', who: 'other', playerId: 'p2' }, ctxOf(prev, next))
    expect(flights).toHaveLength(1)
    expect(flights[0]).toMatchObject({
      from: { kind: 'deck' },
      to: { kind: 'seat', id: 'p2' },
      face: 'Back',
      faceTo: 'Back',
      hideTarget: false,
      absorb: true,
    })
  })

  it("an opponent's draw of two (handCount + 2) sends two backs to their seat", () => {
    const prev = snap()
    const next = snap({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', '9S', 'KH', '4S'] } })
    const flights = flightsFor({ type: 'draw', who: 'other', playerId: 'p2' }, ctxOf(prev, next))
    expect(flights.map((f) => f.to)).toEqual([
      { kind: 'seat', id: 'p2' },
      { kind: 'seat', id: 'p2' },
    ])
  })

  it('a draw whose count did not change (snapshot already applied) still flies one back', () => {
    const flights = flightsFor(
      { type: 'draw', who: 'other', playerId: 'p2' },
      ctxOf(snap(), snap()),
    )
    expect(flights).toHaveLength(1)
    expect(flights[0].to).toEqual({ kind: 'seat', id: 'p2' })
  })

  it('my play: tray cards fly face up to the field top, staggered 34 ms', () => {
    const prev = snap({ field: [['3S']] })
    const next = snap({ field: [['3S'], ['AS', '3H']], hands: { p1: ['JD'], p2: ['2S'] } })
    const flights = flightsFor(
      { type: 'submit-ok', playerId: 'p1', cards: ['AS', '3H'], factor: [] },
      ctxOf(prev, next),
    )
    expect(flights.map((f) => [f.from, f.to, f.face, f.faceTo])).toEqual([
      [{ kind: 'card', card: 'AS' }, { kind: 'field-card', card: 'AS' }, 'AS', 'AS'],
      [{ kind: 'card', card: '3H' }, { kind: 'field-card', card: '3H' }, '3H', '3H'],
    ])
    expect(flights[1].delay - flights[0].delay).toBeCloseTo(GROUP_STAGGER)
    expect(flights.every((f) => f.hideTarget && f.path === 'arc')).toBe(true)
  })

  it("an opponent's play: backs leave their seat and flip face up on the field", () => {
    const flights = flightsFor(
      { type: 'submit-ok', playerId: 'p2', cards: ['KH'], factor: [] },
      ctxOf(snap(), snap({ field: [['KH']] })),
    )
    expect(flights[0]).toMatchObject({
      from: { kind: 'seat', id: 'p2' },
      to: { kind: 'field-card', card: 'KH' },
      face: 'Back',
      faceTo: 'KH',
    })
  })

  it('flow: the previous field top spirals into the deck', () => {
    const prev = snap({ field: [['3S'], ['10C', 'KH']] })
    const flights = flightsFor({ type: 'flow' }, ctxOf(prev, snap()))
    expect(flights.map((f) => f.from)).toEqual([
      { kind: 'field-card', card: '10C' },
      { kind: 'field-card', card: 'KH' },
    ])
    for (const f of flights) {
      expect(f).toMatchObject({
        to: { kind: 'deck' },
        path: 'spiral',
        ease: EASE.in,
        duration: DUR.lg,
        absorb: true,
        hideTarget: false,
      })
    }
  })

  it('57 cut: the old top sweeps away while the 57 lands on the cut overlay', () => {
    const prev = snap({ field: [['3S']] })
    const flights = flightsFor(
      { type: 'cut57', playerId: 'p1', cards: ['5S', '7H'] },
      ctxOf(prev, snap()),
    )
    expect(flights.filter((f) => f.path === 'spiral').map((f) => f.from)).toEqual([
      { kind: 'field-card', card: '3S' },
    ])
    expect(flights.filter((f) => f.path === 'arc').map((f) => f.to)).toEqual([
      { kind: 'cut-card', card: '5S' },
      { kind: 'cut-card', card: '7H' },
    ])
    expect(flights.every((f) => f.delay < DUR.sm)).toBe(true)
  })

  it('penalty: n backs to an opponent seat after the return delay', () => {
    const next = snap({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH', '4S', '9S'] } })
    const flights = flightsFor(
      {
        type: 'submit-fail',
        code: 'BASE_IS_NOT_PRIME',
        playerId: 'p2',
        value: 221,
        factor: [],
        penalty: 2,
      },
      ctxOf(snap(), next),
    )
    expect(flights).toHaveLength(2)
    expect(flights.every((f) => f.to.kind === 'seat' && f.face === 'Back')).toBe(true)
    expect(flights[0].delay).toBeCloseTo(PENALTY_DELAY)
    expect(flights[1].delay).toBeGreaterThan(flights[0].delay)
  })

  it('my penalty: the fresh cards land in my hand', () => {
    const next = snap({ hands: { p1: ['AS', '3H', '4S', 'JD', '9S'], p2: ['2S', '5C', 'KH'] } })
    const flights = flightsFor(
      {
        type: 'submit-fail',
        code: 'INCORRECT_ANSWER',
        playerId: 'p1',
        value: 13,
        factor: [],
        penalty: 2,
      },
      ctxOf(snap(), next),
    )
    expect(flights.map((f) => f.to)).toEqual([
      { kind: 'hand-card', card: '4S' },
      { kind: 'hand-card', card: '9S' },
    ])
  })

  it('no penalty, pass and turn fly nothing', () => {
    const c = ctxOf(snap(), snap())
    expect(
      flightsFor(
        {
          type: 'submit-fail',
          code: 'INVALID_FACT',
          playerId: 'p1',
          value: 1,
          factor: [],
          penalty: 0,
        },
        c,
      ),
    ).toEqual([])
    expect(flightsFor({ type: 'pass', playerId: 'p1' }, c)).toEqual([])
    expect(flightsFor({ type: 'turn', from: 'p1', to: 'p2' }, c)).toEqual([])
  })

  it('deal: round-robin from the deck, all my cards plus a share for each opponent, ≤ 1.2 s', () => {
    const mine = ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS']
    const other = (s: string) =>
      ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J'].map((r) => r + s)
    const next = snap({ hands: { p1: mine, p2: other('H'), p3: other('D') } })
    const flights = flightsFor({ type: 'deal' }, ctxOf(null, next))
    expect(flights.length).toBeLessThanOrEqual(MAX_FLIGHTS)
    expect(flights.filter((f) => f.to.kind === 'hand-card')).toHaveLength(11)
    expect(flights.filter((f) => f.to.kind === 'seat' && f.to.id === 'p2')).toHaveLength(6)
    expect(flights.filter((f) => f.to.kind === 'seat' && f.to.id === 'p3')).toHaveLength(6)
    // round-robin: p1, p2, p3, p1, …
    expect(flights.slice(0, 3).map((f) => (f.to.kind === 'seat' ? f.to.id : 'p1'))).toEqual([
      'p1',
      'p2',
      'p3',
    ])
    expect(planDuration(flights)).toBeLessThanOrEqual(1.2 + 1e-9)
  })
})

describe('planFlights', () => {
  it('chains events: a flow after a failed submit starts once the penalty has landed', () => {
    const prev = snap({ field: [['3S']] })
    const next = snap({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH', '4S'] } })
    const plan = planFlights(
      [
        {
          type: 'submit-fail',
          code: 'BASE_IS_NOT_PRIME',
          playerId: 'p2',
          value: 221,
          factor: [],
          penalty: 1,
        },
        { type: 'flow' },
        { type: 'turn', from: 'p2', to: 'p1' },
      ],
      ctxOf(prev, next),
    )
    expect(plan.map((f) => f.path)).toEqual(['arc', 'spiral'])
    expect(plan[1].delay).toBeCloseTo(plan[0].delay + plan[0].duration)
  })

  it('never exceeds MAX_FLIGHTS', () => {
    const big = Array.from({ length: 30 }, (_, i) => `${i}`)
    const next = snap({ hands: { p1: big, p2: big.map((c) => `${c}x`) } })
    expect(planFlights([{ type: 'deal' }], ctxOf(null, next)).length).toBeLessThanOrEqual(
      MAX_FLIGHTS,
    )
  })

  it('an observer (not in players) sees only seat flights on deal', () => {
    const next = snap({ hands: { p1: ['AS'], p2: ['2S'] }, viewer: 'p9' })
    const plan = planFlights([{ type: 'deal' }], ctxOf(null, next, 'p9'))
    expect(plan.every((f) => f.to.kind === 'seat')).toBe(true)
    expect(plan).toHaveLength(2)
  })
})
