import { describe, expect, it } from 'vitest'
import { cardLabel, cardValue, rankBadge } from './card-label'
import { cardIds } from './suit-num'

describe('cardLabel', () => {
  it.each([
    ['AS', 'スペードのA, 1'],
    ['3S', 'スペードの3, 3'],
    ['10D', 'ダイヤの10, 10'],
    ['JH', 'ハートのJ, 11'],
    ['QC', 'クラブのQ, 12'],
    ['KD', 'ダイヤのK, 13'],
  ] as const)('%s → %s', (card, label) => {
    expect(cardLabel(card)).toBe(label)
  })

  it('labels the back as the deck', () => {
    expect(cardLabel('Back')).toBe('山札')
  })

  it('gives every card a distinct label', () => {
    expect(new Set(cardIds.map(cardLabel)).size).toBe(52)
  })
})

describe('cardValue', () => {
  it.each([
    ['AH', 1],
    ['2C', 2],
    ['10S', 10],
    ['JD', 11],
    ['QS', 12],
    ['KC', 13],
  ] as const)('%s = %i', (card, value) => {
    expect(cardValue(card)).toBe(value)
  })
})

describe('rankBadge', () => {
  it('is shown for A, J, Q, K only', () => {
    expect(rankBadge('JS')).toBe('J = 11')
    expect(rankBadge('AD')).toBe('A = 1')
    expect(rankBadge('KH')).toBe('K = 13')
    expect(rankBadge('10C')).toBeNull()
    expect(rankBadge('7H')).toBeNull()
    expect(rankBadge('Back')).toBeNull()
  })
})
