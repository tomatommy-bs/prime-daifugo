import type { CardId } from '@/game-card/src'
import { makeCtx, makeGameState, makePresence } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import {
  buildSeats,
  deriveLeadId,
  deriveObservers,
  observerSeats,
  orderPlayers,
  playerSeats,
  residueLabel,
  seatHueVar,
} from './seat-model'

const hand = (n: number) => Array.from({ length: n }, () => 'AS' as CardId)

const threePlayers = () =>
  makeGameState({
    players: { p1: { hand: hand(7) }, p2: { hand: hand(9) }, p3: { hand: hand(3) } },
  })

describe('orderPlayers', () => {
  it.each([
    { order: ['p1', 'p2', 'p3'], self: 'p1', expected: ['p1', 'p2', 'p3'] },
    { order: ['p1', 'p2', 'p3'], self: 'p2', expected: ['p2', 'p3', 'p1'] },
    { order: ['p1', 'p2', 'p3'], self: 'p3', expected: ['p3', 'p1', 'p2'] },
    { order: ['p3', 'p1', 'p2'], self: 'p1', expected: ['p1', 'p2', 'p3'] },
    { order: ['p1', 'p2', 'p3'], self: 'obs', expected: ['p1', 'p2', 'p3'] },
    { order: ['p1', 'obs', 'p2', 'p3'], self: 'p2', expected: ['p2', 'p3', 'p1'] },
    // players missing from playOrder are appended, then the list rotates to self
    { order: ['p2'], self: 'p1', expected: ['p1', 'p3', 'p2'] },
  ])('playOrder $order, self $self → $expected', ({ order, self, expected }) => {
    expect(orderPlayers(['p1', 'p2', 'p3'], order, self)).toEqual(expected)
  })
})

describe('buildSeats', () => {
  it('rotates the play order so that self is k0', () => {
    const seats = buildSeats({
      gameState: threePlayers(),
      ctx: makeCtx({ playOrder: ['p1', 'p2', 'p3'], currentPlayer: 'p1' }),
      presence: makePresence(['alice', 'bob', 'carol']),
      selfId: 'p2',
    })
    expect(seats.map((s) => [s.id, s.k, s.name])).toEqual([
      ['p2', 0, 'bob'],
      ['p3', 1, 'carol'],
      ['p1', 2, 'alice'],
    ])
    expect(seats.map((s) => s.isSelf)).toEqual([true, false, false])
  })

  it('keeps the playOrder index as the hue so it matches on every client', () => {
    const args = {
      gameState: threePlayers(),
      ctx: makeCtx({ playOrder: ['p1', 'p2', 'p3'] }),
      presence: makePresence(['alice', 'bob', 'carol']),
    }
    const fromP1 = buildSeats({ ...args, selfId: 'p1' })
    const fromP3 = buildSeats({ ...args, selfId: 'p3' })
    const hue = (seats: typeof fromP1) => Object.fromEntries(seats.map((s) => [s.id, s.hueIndex]))
    expect(hue(fromP1)).toEqual({ p1: 0, p2: 1, p3: 2 })
    expect(hue(fromP3)).toEqual(hue(fromP1))
  })

  it('takes hand counts, lead, passed and the active seat from the state', () => {
    const gameState = { ...threePlayers(), deckTopPlayer: 'p2' }
    const seats = buildSeats({
      gameState,
      ctx: makeCtx({ playOrder: ['p1', 'p2', 'p3'], currentPlayer: 'p3' }),
      presence: makePresence(['alice', 'bob', 'carol']),
      selfId: 'p1',
      passedIds: ['p1'],
      leftTime: 42,
      penalties: { p2: 2, p3: 0 },
    })
    const byId = Object.fromEntries(seats.map((s) => [s.id, s]))
    expect(byId.p1).toMatchObject({ handCount: 7, passed: true, isLead: false, isActive: false })
    expect(byId.p2).toMatchObject({ handCount: 9, isLead: true, passed: false, penalty: 2 })
    expect(byId.p3).toMatchObject({ handCount: 3, isActive: true, leftTime: 42, timeLimit: 60 })
    expect(byId.p3.penalty).toBeUndefined()
    // leftTime belongs to the active seat only
    expect(byId.p1.leftTime).toBeUndefined()
  })

  it('flags observers (presence not in players) and appends them after the players', () => {
    const seats = buildSeats({
      gameState: makeGameState({ players: { p1: { hand: hand(2) }, p2: { hand: hand(5) } } }),
      // quirk: the observer appears in playOrder
      ctx: makeCtx({ playOrder: ['p1', 'p3', 'p2'], currentPlayer: 'p1' }),
      presence: makePresence(['alice', 'bob', 'dave']),
      selfId: 'p1',
    })
    expect(playerSeats(seats).map((s) => s.id)).toEqual(['p1', 'p2'])
    const observers = observerSeats(seats)
    expect(observers).toHaveLength(1)
    expect(observers[0]).toMatchObject({
      id: 'p3',
      name: 'dave',
      observer: true,
      handCount: null,
      isActive: false,
      k: 2,
    })
  })

  it('lights no seat when the turn lands on an observer (server quirk)', () => {
    const seats = buildSeats({
      gameState: makeGameState({ players: { p1: {}, p2: {} } }),
      ctx: makeCtx({ playOrder: ['p1', 'p3', 'p2'], currentPlayer: 'p3' }),
      presence: makePresence(['alice', 'bob', 'dave']),
      selfId: 'p1',
      leftTime: 12,
    })
    expect(seats.some((s) => s.isActive)).toBe(false)
    expect(seats.some((s) => s.leftTime !== undefined)).toBe(false)
  })

  it('treats self as an observer when self is not a player', () => {
    const seats = buildSeats({
      gameState: makeGameState({ players: { p1: {}, p2: {} } }),
      ctx: makeCtx({ playOrder: ['p1', 'p2'] }),
      presence: makePresence(['alice', 'bob', 'me']),
      selfId: 'p3',
    })
    expect(playerSeats(seats).map((s) => s.id)).toEqual(['p1', 'p2'])
    expect(observerSeats(seats)[0]).toMatchObject({ id: 'p3', isSelf: true, observer: true })
  })

  it('falls back to the id when a player has no presence entry', () => {
    const seats = buildSeats({
      gameState: makeGameState({ players: { p1: {}, ghost: {} } }),
      ctx: makeCtx({ playOrder: ['p1', 'ghost'] }),
      presence: makePresence(['alice']),
      selfId: 'p1',
    })
    expect(seats[1]).toMatchObject({ id: 'ghost', name: 'ghost', observer: false })
  })

  it('without a game state lists presence with no hands and no observers', () => {
    const seats = buildSeats({
      gameState: null,
      ctx: null,
      presence: makePresence(['alice', 'bob']),
      selfId: 'p2',
    })
    expect(seats.map((s) => [s.id, s.handCount, s.observer, s.isSelf])).toEqual([
      ['p1', null, false, false],
      ['p2', null, false, true],
    ])
  })

  it('works without ctx (order of the players record)', () => {
    const seats = buildSeats({
      gameState: threePlayers(),
      ctx: null,
      presence: makePresence(['alice', 'bob', 'carol']),
      selfId: 'p3',
    })
    expect(seats.map((s) => s.id)).toEqual(['p3', 'p1', 'p2'])
    expect(seats.some((s) => s.isActive)).toBe(false)
  })
})

describe('deriveObservers / deriveLeadId', () => {
  it('no observers before the first state', () => {
    expect(deriveObservers(null, makePresence(['a', 'b']))).toEqual([])
  })
  it('observers are presence ids missing from players', () => {
    expect(
      deriveObservers(makeGameState({ players: { p2: {} } }), makePresence(['a', 'b', 'c'])),
    ).toEqual(['p1', 'p3'])
  })
  it.each([
    [null, null],
    ['p1', 'p1'],
    ['gone', null],
  ])('deckTopPlayer %s → lead %s', (top, lead) => {
    expect(deriveLeadId(makeGameState({ deckTopPlayer: top }))).toBe(lead)
  })
  it('null state → null lead', () => {
    expect(deriveLeadId(null)).toBeNull()
  })
})

describe('seatHueVar / residueLabel', () => {
  it.each([
    [0, 'var(--seat-0)'],
    [3, 'var(--seat-3)'],
    [4, 'var(--seat-0)'],
    [6, 'var(--seat-2)'],
    [-1, 'var(--seat-3)'],
  ])('hue %i → %s', (i, v) => {
    expect(seatHueVar(i)).toBe(v)
  })
  it.each([
    [0, '①'],
    [1, '②'],
    [3, '④'],
    [19, '⑳'],
    [20, '(21)'],
  ])('residue %i → %s', (k, label) => {
    expect(residueLabel(k)).toBe(label)
  })
})
