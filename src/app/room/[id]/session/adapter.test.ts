import type { RoomEvent } from '@/shared/protocol'
import { makeView, makeViewMember } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_NAME,
  eventToSystemMessage,
  eventToTransitionMsg,
  viewToBundle,
  viewToPresence,
} from './adapter'

const members = [
  makeViewMember({ id: 'p1', name: 'alice' }),
  makeViewMember({ id: 'p2', name: 'bob' }),
]

describe('viewToBundle', () => {
  it('returns null without a game', () => {
    expect(viewToBundle(makeView({ game: null }), 'p1')).toBeNull()
  })

  it('gives only the viewer a hand and keeps the others as counts', () => {
    const view = makeView({
      game: {
        players: { p1: { handCount: 3, drawRight: true }, p2: { handCount: 7, drawRight: false } },
        hand: ['AS', '3H', 'JD'],
        field: [['5S'], ['7H', '3C']],
        deckCount: 12,
        deckTopPlayer: 'p2',
        currentPlayer: 'p2',
        playOrder: ['p2', 'p1'],
        turn: 4,
        deadline: 1234,
        winner: { id: 'p2', name: 'bob' },
        lastResult: 'BASE_IS_NOT_PRIME',
      },
    })
    expect(viewToBundle(view, 'p1')).toEqual({
      gameState: {
        players: {
          p1: { hand: ['AS', '3H', 'JD'], handCount: 3, drawRight: true },
          p2: { hand: [], handCount: 7, drawRight: false },
        },
        field: [['5S'], ['7H', '3C']],
        deckCount: 12,
        deckTopPlayer: 'p2',
        rule: view.rule,
        winner: 'p2',
        lastSubmitError: 'BASE_IS_NOT_PRIME',
      },
      ctx: { currentPlayer: 'p2', playOrder: ['p2', 'p1'], turn: 4, deadline: 1234 },
    })
  })

  it('gives observers no hand at all', () => {
    const bundle = viewToBundle(makeView({ game: { hand: [] } }), 'p9')
    expect(Object.values(bundle?.gameState.players ?? {}).every((p) => p.hand.length === 0)).toBe(
      true,
    )
  })

  it('copies arrays so the bundle does not alias the view', () => {
    const view = makeView()
    const bundle = viewToBundle(view, 'p1')
    bundle?.gameState.players.p1.hand.push('KD')
    bundle?.ctx.playOrder.push('px')
    expect(view.game?.hand).toEqual(['AS', '3H', 'JD'])
    expect(view.game?.playOrder).toEqual(['p1', 'p2'])
  })

  it('maps a null winner and a null selfId', () => {
    const bundle = viewToBundle(makeView(), null)
    expect(bundle?.gameState.winner).toBeNull()
    expect(bundle?.gameState.players.p1.hand).toEqual([])
  })
})

describe('viewToPresence', () => {
  it('maps ready to status and keeps role and connected', () => {
    const view = makeView({
      members: [
        makeViewMember({ id: 'p1', name: 'alice', ready: true, role: 'player' }),
        makeViewMember({
          id: 'p2',
          name: 'bob',
          ready: false,
          role: 'observer',
          connected: false,
        }),
      ],
    })
    expect(viewToPresence(view)).toEqual([
      { id: 'p1', name: 'alice', status: 'ready', role: 'player', connected: true },
      { id: 'p2', name: 'bob', status: 'not-ready', role: 'observer', connected: false },
    ])
  })
})

describe('eventToSystemMessage / eventToTransitionMsg (spec §9.2, every RoomEvent)', () => {
  const rule = { initNumCards: 8, maxSubmitNumCards: 4, timeLimit: 60, halfEvenNumbers: false }
  const cases: { e: RoomEvent; system: unknown; transition: unknown }[] = [
    { e: { type: 'presence' }, system: null, transition: null },
    { e: { type: 'ready-changed', by: 'p1', ready: true }, system: null, transition: null },
    {
      e: { type: 'rule-changed', by: 'p2', rule },
      system: null,
      transition: { action: 'change-rule', rule, by: 'p2' },
    },
    {
      e: { type: 'game-started', by: 'p1', round: 2 },
      system: { action: 'game-start', commander: { id: 'p1', name: 'alice' } },
      transition: 'same',
    },
    {
      e: { type: 'drew', by: 'p2' },
      system: { action: 'draw', commander: { id: 'p2', name: 'bob' } },
      transition: 'same',
    },
    {
      e: { type: 'passed', by: 'p1', reason: 'manual', flowed: false },
      system: { action: 'pass', commander: { id: 'p1', name: 'alice' }, reason: 'manual' },
      transition: 'same',
    },
    {
      e: { type: 'passed', by: 'p2', reason: 'timeout', flowed: true },
      system: { action: 'pass', commander: { id: 'p2', name: 'bob' }, reason: 'timeout' },
      transition: 'same',
    },
    {
      e: {
        type: 'submitted',
        by: 'p1',
        submit: ['5S', '7H'],
        factor: [],
        result: null,
        cut57: true,
        flowed: true,
        penalty: 0,
      },
      system: {
        action: 'submit',
        commander: { id: 'p1', name: 'alice' },
        submissionResult: { submitCardSet: { submit: ['5S', '7H'], factor: [] }, result: null },
      },
      transition: 'same',
    },
    {
      e: {
        type: 'submitted',
        by: 'p2',
        submit: ['QS'],
        factor: ['2S', '*', '6H'],
        result: 'FACT_CONTAIN_NOT_PRIME',
        cut57: false,
        flowed: false,
        penalty: 3,
      },
      system: {
        action: 'submit',
        commander: { id: 'p2', name: 'bob' },
        submissionResult: {
          submitCardSet: { submit: ['QS'], factor: ['2S', '*', '6H'] },
          result: 'FACT_CONTAIN_NOT_PRIME',
        },
      },
      transition: 'same',
    },
    {
      e: { type: 'forfeited', pid: 'p2', reason: 'grace' },
      system: null,
      transition: { action: 'snapshot' },
    },
    {
      e: { type: 'forfeited', pid: 'p2', reason: 'leave' },
      system: null,
      transition: { action: 'snapshot' },
    },
    {
      e: { type: 'game-ended', winnerId: 'p1', winnerName: 'alice', reason: 'empty-hand' },
      system: { action: 'game-end', winner: 'alice', winnerId: 'p1' },
      transition: 'same',
    },
    {
      e: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'last-standing' },
      system: { action: 'game-end', winner: 'bob', winnerId: 'p2' },
      transition: 'same',
    },
    { e: { type: 'member-left', pid: 'p2', name: 'bob' }, system: null, transition: null },
  ]

  it.each(cases)('$e.type', ({ e, system, transition }) => {
    expect(eventToSystemMessage(e, members)).toEqual(system)
    expect(eventToTransitionMsg(e, members)).toEqual(transition === 'same' ? system : transition)
  })

  it('covers every RoomEvent type', () => {
    const types = new Set(cases.map((c) => c.e.type))
    expect([...types].sort()).toEqual(
      [
        'drew',
        'forfeited',
        'game-ended',
        'game-started',
        'member-left',
        'passed',
        'presence',
        'ready-changed',
        'rule-changed',
        'submitted',
      ].sort(),
    )
  })

  it('never shows a raw pid as a name', () => {
    expect(eventToSystemMessage({ type: 'drew', by: 'ghost' }, members)).toEqual({
      action: 'draw',
      commander: { id: 'ghost', name: UNKNOWN_NAME },
    })
  })
})
