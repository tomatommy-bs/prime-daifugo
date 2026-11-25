import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import type { SubmitResultCode } from '@/shared/protocol'
import { makeClientCtx, makeClientGameState } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import {
  type GameState,
  type TransitionMsg,
  classifyTransition,
  offendingFactorIndex,
  resultViewOf,
} from './classify-transition'
import type { BoardEvent } from './types'

const alice = { id: 'p1', name: 'alice' }
const bob = { id: 'p2', name: 'bob' }

/**
 * A UI state as `viewer` receives it (spec §9.3): the viewer's own hand carries ids, every
 * other hand is `[]` with only its `handCount`.
 */
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

type Commander = { id: string; name: string }

/** The game messages the session adapter builds from room events (spec §9.2). */
const msg = {
  gameStart: (commander: Commander): TransitionMsg => ({ action: 'game-start', commander }),
  draw: (commander: Commander): TransitionMsg => ({ action: 'draw', commander }),
  pass: (commander: Commander, reason: 'manual' | 'timeout' = 'manual'): TransitionMsg => ({
    action: 'pass',
    commander,
    reason,
  }),
  submit: (
    commander: Commander,
    submit: string[],
    factor: string[] = [],
    result: SubmitResultCode | null = null,
  ): TransitionMsg => ({
    action: 'submit',
    commander,
    submissionResult: {
      submitCardSet: { submit: submit as CardId[], factor: factor as FactCardId[] },
      result,
    },
  }),
  gameEnd: (winner: Commander): TransitionMsg => ({
    action: 'game-end',
    winner: winner.name,
    winnerId: winner.id,
  }),
}

type Row = {
  name: string
  prev: GameState | null
  next: GameState
  msg: TransitionMsg
  self?: string
  expected: BoardEvent[]
}

const rows: Row[] = [
  {
    name: 'deal on game-start',
    prev: null,
    next: snap(),
    msg: msg.gameStart(alice),
    expected: [{ type: 'deal' }, { type: 'turn', from: null, to: 'p1' }],
  },
  {
    name: 'draw by me',
    prev: snap(),
    next: snap({ hands: { p1: ['AS', '3H', 'JD', '4S'], p2: ['2S', '5C', 'KH'] } }),
    msg: msg.draw(alice),
    expected: [{ type: 'draw', who: 'me', playerId: 'p1' }],
  },
  {
    name: 'draw by another player',
    prev: snap({ current: 'p2' }),
    next: snap({ current: 'p2', hands: { p1: ['AS'], p2: ['2S', '5C', 'KH', '4S'] } }),
    msg: msg.draw(bob),
    expected: [{ type: 'draw', who: 'other', playerId: 'p2' }],
  },
  {
    name: 'submit ok moves the turn',
    prev: snap({ field: [['3S']] }),
    next: snap({ field: [['3S'], ['AS', '3H']], current: 'p2' }),
    msg: msg.submit(alice, ['AS', '3H']),
    expected: [
      { type: 'submit-ok', playerId: 'p1', cards: ['AS', '3H'], factor: [] },
      { type: 'turn', from: 'p1', to: 'p2' },
    ],
  },
  {
    name: '57 is a cut, never a flow, and keeps the turn',
    prev: snap({ field: [['3S']] }),
    next: snap({ field: [], current: 'p1' }),
    msg: msg.submit(alice, ['5S', '7H']),
    expected: [{ type: 'cut57', playerId: 'p1', cards: ['5S', '7H'] }],
  },
  {
    name: 'flow after pass when the turn returns to the lead',
    prev: snap({ field: [['3S']], current: 'p2' }),
    next: snap({ field: [], current: 'p1' }),
    msg: msg.pass(bob),
    expected: [
      { type: 'pass', playerId: 'p2' },
      { type: 'flow' },
      { type: 'turn', from: 'p2', to: 'p1' },
    ],
  },
  {
    name: 'pass without flow',
    prev: snap({ current: 'p1' }),
    next: snap({ current: 'p2' }),
    msg: msg.pass(alice),
    expected: [
      { type: 'pass', playerId: 'p1' },
      { type: 'turn', from: 'p1', to: 'p2' },
    ],
  },
  {
    name: 'BASE_IS_NOT_PRIME penalty equals the submitted count',
    prev: snap({ hands: { p1: ['2S', '2H', 'JD'], p2: ['KH'] } }),
    next: snap({ hands: { p1: ['2S', '2H', 'JD', '4S', '6D'], p2: ['KH'] }, current: 'p2' }),
    msg: msg.submit(alice, ['2S', '2H'], [], 'BASE_IS_NOT_PRIME'),
    expected: [
      {
        type: 'submit-fail',
        code: 'BASE_IS_NOT_PRIME',
        playerId: 'p1',
        value: 22,
        factor: [],
        penalty: 2,
      },
      { type: 'turn', from: 'p1', to: 'p2' },
    ],
  },
  {
    name: 'FACT_CONTAIN_NOT_PRIME penalty counts submit and factor cards',
    prev: snap({ hands: { p1: ['2S', '2H', '4C', 'JD'], p2: ['KH'] } }),
    next: snap({
      hands: { p1: ['2S', '2H', '4C', 'JD', '4S', '6D', '7C'], p2: ['KH'] },
      current: 'p2',
    }),
    msg: msg.submit(alice, ['2S', '2H'], ['2S', '*', '4C'], 'FACT_CONTAIN_NOT_PRIME'),
    expected: [
      {
        type: 'submit-fail',
        code: 'FACT_CONTAIN_NOT_PRIME',
        playerId: 'p1',
        value: 22,
        factor: ['2S', '*', '4C'],
        penalty: 3,
      },
      { type: 'turn', from: 'p1', to: 'p2' },
    ],
  },
  {
    name: 'INCORRECT_ANSWER for another player',
    prev: snap({ current: 'p2', hands: { p1: ['AS'], p2: ['2S', '2H', '3C', 'KH'] } }),
    next: snap({
      current: 'p1',
      hands: { p1: ['AS'], p2: ['2S', '2H', '3C', 'KH', '4S', '6D', '7C'] },
    }),
    msg: msg.submit(bob, ['2S', '2H'], ['3C'], 'INCORRECT_ANSWER'),
    expected: [
      {
        type: 'submit-fail',
        code: 'INCORRECT_ANSWER',
        playerId: 'p2',
        value: 22,
        factor: ['3C'],
        penalty: 3,
      },
      { type: 'turn', from: 'p2', to: 'p1' },
    ],
  },
  {
    name: 'a failed submit can also flow the field',
    prev: snap({ field: [['3S']], current: 'p2', hands: { p1: ['AS'], p2: ['4S', '6D'] } }),
    next: snap({ field: [], current: 'p1', hands: { p1: ['AS'], p2: ['4S', '6D', '8H'] } }),
    msg: msg.submit(bob, ['6D'], [], 'BASE_IS_NOT_PRIME'),
    expected: [
      {
        type: 'submit-fail',
        code: 'BASE_IS_NOT_PRIME',
        playerId: 'p2',
        value: 6,
        factor: [],
        penalty: 1,
      },
      { type: 'flow' },
      { type: 'turn', from: 'p2', to: 'p1' },
    ],
  },
  {
    name: 'game-end becomes a held end event',
    prev: snap(),
    next: snap(),
    msg: msg.gameEnd(bob),
    expected: [{ type: 'end', winner: 'bob' }],
  },
  {
    name: 'the late winning submit (state already final) is still a submit-ok',
    prev: snap({ hands: { p1: ['AS'], p2: [] }, field: [['3S']] }),
    next: snap({ hands: { p1: ['AS'], p2: [] }, field: [['3S']] }),
    msg: msg.submit(bob, ['KH']),
    expected: [{ type: 'submit-ok', playerId: 'p2', cards: ['KH'], factor: [] }],
  },
  {
    name: 'a timeout pass animates like a manual pass',
    prev: snap({ current: 'p2' }),
    next: snap({ current: 'p1' }),
    msg: msg.pass(bob, 'timeout'),
    expected: [
      { type: 'pass', playerId: 'p2' },
      { type: 'turn', from: 'p2', to: 'p1' },
    ],
  },
  {
    name: 'a snapshot shows nothing',
    prev: null,
    next: snap(),
    msg: { action: 'snapshot' },
    expected: [],
  },
  {
    name: 'change-rule shows nothing',
    prev: null,
    next: snap(),
    msg: {
      action: 'change-rule',
      rule: { initNumCards: 11, maxSubmitNumCards: 4, timeLimit: 15, halfEvenNumbers: false },
      by: 'p1',
    },
    expected: [],
  },
]

describe('classifyTransition', () => {
  it.each(rows)('$name', ({ prev, next, msg, self = 'p1', expected }) => {
    expect(classifyTransition(prev, next, msg, self)).toEqual(expected)
  })

  it('is pure: inputs are not mutated', () => {
    const prev = snap({ field: [['3S']] })
    const next = snap({ field: [], current: 'p2' })
    const before = JSON.stringify([prev, next])
    classifyTransition(prev, next, msg.pass(alice), 'p1')
    expect(JSON.stringify([prev, next])).toBe(before)
  })
})

describe('resultViewOf', () => {
  it('maps submit-ok to an ok view', () => {
    expect(
      resultViewOf({ type: 'submit-ok', playerId: 'p1', cards: ['AS', '3H'], factor: [] }, 'alice'),
    ).toEqual({ kind: 'ok', value: 13, factor: undefined, penalty: 0, submitter: 'alice' })
  })

  it('carries the penalty and the evaluated expression of a wrong equation', () => {
    const view = resultViewOf(
      {
        type: 'submit-fail',
        code: 'INCORRECT_ANSWER',
        playerId: 'p2',
        value: 22,
        factor: ['3C', '*', '7S'],
        penalty: 4,
      },
      'bob',
    )
    expect(view).toMatchObject({ kind: 'INCORRECT_ANSWER', evaluated: 21, penalty: 4 })
  })

  it('boxes the first composite base of FACT_CONTAIN_NOT_PRIME', () => {
    expect(offendingFactorIndex(['2S', '*', '9H', '*', '3C'])).toBe(1)
    expect(offendingFactorIndex(['2S', '^', '4H', '*', '3C'])).toBeUndefined()
    const view = resultViewOf(
      {
        type: 'submit-fail',
        code: 'FACT_CONTAIN_NOT_PRIME',
        playerId: 'p1',
        value: 54,
        factor: ['2S', '*', '9H', '*', '3C'],
        penalty: 5,
      },
      'alice',
    )
    expect(view).toMatchObject({ offendingIndex: 1, evaluated: undefined })
  })

  it('shows nothing for INVALID_FACT and non-submit events', () => {
    expect(
      resultViewOf(
        {
          type: 'submit-fail',
          code: 'INVALID_FACT',
          playerId: 'p1',
          value: 4,
          factor: ['4S'],
          penalty: 0,
        },
        'alice',
      ),
    ).toBeNull()
    expect(resultViewOf({ type: 'flow' }, 'alice')).toBeNull()
    expect(resultViewOf(null, 'alice')).toBeNull()
  })
})
