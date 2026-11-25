import type { CardId } from '@/game-card/src'
import { describe, expect, it } from 'vitest'
import {
  FRESH_MS,
  cardWidthFromHeight,
  minExposedSlice,
  rovingIndex,
  trayChecks,
} from './card-tray-utils'

describe('trayChecks', () => {
  it('empty tray: no value, nothing ok', () => {
    expect(trayChecks([], null)).toEqual({
      value: null,
      countOk: false,
      greaterOk: false,
      isGrothendieck: false,
    })
    expect(trayChecks([], ['3S'])).toMatchObject({ value: null, countOk: false, greaterOk: false })
  })

  // cards, fieldTop, value, countOk, greaterOk
  it.each<[CardId[], CardId[] | null, number, boolean, boolean]>([
    // free field: any count, always greater
    [['3S'], null, 3, true, true],
    [['AS', '3H'], [], 13, true, true],
    [['KS', 'KH', 'KC'], null, 131313, true, true],
    // same count, greater
    [['AS', '3H'], ['4S', '7D'], 13, true, false],
    [['4S', '7D'], ['AS', '3H'], 47, true, true],
    // same count, equal value is not greater
    [['4S', '7D'], ['4H', '7C'], 47, true, false],
    // same count, single card, not greater
    [['2S'], ['KS'], 2, true, false],
    // wrong count, greater
    [['JS', 'QS', 'KS'], ['2S', '3S'], 111213, false, true],
    [['2S', '3S'], ['KS'], 23, false, true],
    // wrong count, not greater
    [['AS'], ['2S', '3S'], 1, false, false],
  ])('%j vs %j → value %i, count %s, greater %s', (cards, top, value, countOk, greaterOk) => {
    const r = trayChecks(cards, top)
    expect(r.value).toBe(value)
    expect(r.countOk).toBe(countOk)
    expect(r.greaterOk).toBe(greaterOk)
  })

  it('flags exactly 57', () => {
    expect(trayChecks(['5S', '7H'], null).isGrothendieck).toBe(true)
    expect(trayChecks(['5S', '7H'], ['KS', 'KH']).isGrothendieck).toBe(true)
    expect(trayChecks(['5S', '7H', '2C'], null).isGrothendieck).toBe(false)
    expect(trayChecks(['5S'], null).isGrothendieck).toBe(false)
  })
})

describe('rovingIndex', () => {
  it('moves by one and clamps at the ends', () => {
    expect(rovingIndex('ArrowRight', 0, 3)).toBe(1)
    expect(rovingIndex('ArrowRight', 2, 3)).toBe(2)
    expect(rovingIndex('ArrowLeft', 2, 3)).toBe(1)
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(0)
  })
  it('Home / End', () => {
    expect(rovingIndex('Home', 2, 5)).toBe(0)
    expect(rovingIndex('End', 0, 5)).toBe(4)
  })
  it('ignores other keys and empty lists', () => {
    expect(rovingIndex('Enter', 0, 3)).toBeNull()
    expect(rovingIndex('a', 0, 3)).toBeNull()
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull()
  })
  it('recovers from an out-of-range index', () => {
    expect(rovingIndex('ArrowLeft', 9, 3)).toBe(1)
  })
})

describe('sizing helpers', () => {
  it('slice threshold is max(32px, 0.38w)', () => {
    expect(minExposedSlice(50)).toBe(32)
    expect(minExposedSlice(100)).toBeCloseTo(38)
  })
  it('card width ratio', () => {
    expect(cardWidthFromHeight(100)).toBeCloseTo(68.86)
  })
  it('fresh lasts 2584 ms', () => {
    expect(FRESH_MS).toBe(2584)
  })
})
