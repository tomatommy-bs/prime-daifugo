import type { CardId } from '@/game-card/src'
import { describe, expect, it } from 'vitest'
import {
  ACTION_ORIENTATION,
  SUBMIT_ERRORS,
  beatsField,
  connectionStateOf,
  drawDisabledReason,
  isObserver,
  validateSubmitCardSet,
  winnerIdOf,
} from './board-state'
import { trayChecks } from './card-tray-utils'

const c = (...ids: string[]) => ids as CardId[]

describe('beatsField', () => {
  it('is strict: a tie does not beat the field (the server rejects it)', () => {
    expect(beatsField(c('5H'), c('5S'))).toBe(false)
    expect(beatsField(c('6H'), c('5S'))).toBe(true)
    expect(beatsField(c('4H'), c('5S'))).toBe(false)
  })
  it('anything beats a free field', () => {
    expect(beatsField(c('AH'), null)).toBe(true)
    expect(beatsField(c('AH'), undefined)).toBe(true)
    expect(beatsField(c('AH'), [])).toBe(true)
  })
})

describe('validateSubmitCardSet', () => {
  const plain = (...submit: string[]) => ({ submit: c(...submit), factor: [] })

  it('rejects a smaller value and a tie with the > 場 message', () => {
    expect(validateSubmitCardSet(c('KS'), plain('5H'))).toBe(SUBMIT_ERRORS.notGreater)
    expect(validateSubmitCardSet(c('5S'), plain('5H'))).toBe(SUBMIT_ERRORS.notGreater)
  })

  it('rejects a card count that does not match the field', () => {
    // 2·10 + 3 = 23 > 5, but two cards against one
    expect(validateSubmitCardSet(c('5S'), plain('2H', '3C'))).toBe(SUBMIT_ERRORS.count)
  })

  it('rejects a malformed factorisation on a free field', () => {
    const set = { submit: c('KH'), factor: c('*', '3S') as never }
    expect(validateSubmitCardSet(undefined, set)).toBe(SUBMIT_ERRORS.invalidFact)
  })

  it('lets valid moves through (primality is the server’s call)', () => {
    expect(validateSubmitCardSet(undefined, plain('KH'))).toBeNull()
    expect(validateSubmitCardSet(c('5S'), plain('7H'))).toBeNull()
    expect(
      validateSubmitCardSet(undefined, { submit: c('6H'), factor: c('2S', '*', '3C') as never }),
    ).toBeNull()
  })

  it('agrees with the tray hint on ties', () => {
    const tray = trayChecks(c('5H'), c('5S'))
    expect(tray.greaterOk).toBe(false)
    expect(validateSubmitCardSet(c('5S'), plain('5H'))).not.toBeNull()
  })
})

describe('drawDisabledReason', () => {
  it('explains why 引く is off, in priority order', () => {
    expect(drawDisabledReason({ isMyTurn: false, drawRight: false, deckCount: 0 })).toBe(
      'not-your-turn',
    )
    expect(drawDisabledReason({ isMyTurn: true, drawRight: false, deckCount: 0 })).toBe('drawn')
    expect(drawDisabledReason({ isMyTurn: true, drawRight: true, deckCount: 0 })).toBe('empty')
    expect(drawDisabledReason({ isMyTurn: true, drawRight: undefined, deckCount: 3 })).toBeNull()
  })
})

describe('connectionStateOf', () => {
  it('maps socket and sync progress to the overlay state', () => {
    const base = { roomStatus: 'playing' as const, hasGameState: true }
    expect(connectionStateOf({ ...base, readyState: 0 })).toBe('connecting')
    expect(connectionStateOf({ ...base, readyState: 3 })).toBe('closed')
    expect(connectionStateOf({ ...base, readyState: 3, errored: true })).toBe('error')
    expect(connectionStateOf({ ...base, readyState: 1 })).toBe('open')
    expect(connectionStateOf({ readyState: 1, roomStatus: null, hasGameState: false })).toBe(
      'waiting-sync',
    )
    expect(connectionStateOf({ readyState: 1, roomStatus: 'playing', hasGameState: false })).toBe(
      'waiting-sync',
    )
    expect(connectionStateOf({ readyState: 1, roomStatus: 'waiting', hasGameState: false })).toBe(
      'open',
    )
  })
})

describe('isObserver / winnerIdOf', () => {
  it('a not-ready client and a late joiner (absent from players) both watch', () => {
    const players = { p1: {}, p2: {} }
    expect(isObserver('not-ready', players, 'p1')).toBe(true)
    expect(isObserver('ready', players, 'p3')).toBe(true)
    expect(isObserver('ready', players, 'p1')).toBe(false)
    expect(isObserver(undefined, undefined, 'p1')).toBe(false)
  })

  it('the winner is the player with an empty hand', () => {
    expect(winnerIdOf({ p1: { hand: ['AS'] }, p2: { hand: [] } })).toBe('p2')
    expect(winnerIdOf({ p1: { hand: ['AS'] } })).toBeUndefined()
    expect(winnerIdOf(undefined)).toBeUndefined()
  })
})

it('ACTION_ORIENTATION covers every layout mode', () => {
  expect(ACTION_ORIENTATION).toEqual({
    compact: 'rail',
    regular: 'rail',
    portrait: 'bottom',
    wide: 'row',
  })
})
