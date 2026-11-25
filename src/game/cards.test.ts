import { describe, expect, it } from 'vitest'
import {
  FULL_DECK,
  HALF_EVEN_REMOVED,
  buildDeck,
  cardSuit,
  cardValue,
  halfEvenNumbers,
  isCardId,
} from './cards'

const CARD_ID_RE = /^(A|[2-9]|10|J|Q|K)[SHCD]$/

describe('cards', () => {
  it('RQ-R1: the full deck is 52 distinct cards with no joker', () => {
    expect(FULL_DECK).toHaveLength(52)
    expect(new Set(FULL_DECK).size).toBe(52)
    for (const card of FULL_DECK) {
      expect(card).toMatch(CARD_ID_RE)
    }
  })

  it('RQ-R2: card values', () => {
    expect(cardValue('AS')).toBe(1)
    expect(cardValue('2H')).toBe(2)
    expect(cardValue('9C')).toBe(9)
    expect(cardValue('10D')).toBe(10)
    expect(cardValue('JS')).toBe(11)
    expect(cardValue('QH')).toBe(12)
    expect(cardValue('KC')).toBe(13)
  })

  it('cardSuit and isCardId', () => {
    expect(cardSuit('10D')).toBe('D')
    expect(cardSuit('AS')).toBe('S')
    expect(isCardId('10H')).toBe(true)
    expect(isCardId('1H')).toBe(false)
    expect(isCardId('*')).toBe(false)
    expect(isCardId(5)).toBe(false)
  })

  it('RQ-R5: halfEvenNumbers removes 2,4,6,8,10,Q of hearts and diamonds', () => {
    expect([...HALF_EVEN_REMOVED].sort()).toEqual(
      ['2H', '2D', '4H', '4D', '6H', '6D', '8H', '8D', '10H', '10D', 'QH', 'QD'].sort(),
    )
    const deck = halfEvenNumbers(FULL_DECK)
    expect(deck).toHaveLength(40)
    expect(deck.some((card) => HALF_EVEN_REMOVED.includes(card))).toBe(false)
    // spades and clubs keep their even cards
    expect(deck).toContain('2S')
    expect(deck).toContain('QC')
  })

  it('buildDeck follows the rule and returns a fresh array', () => {
    expect(buildDeck({ halfEvenNumbers: false })).toEqual([...FULL_DECK])
    expect(buildDeck({ halfEvenNumbers: true })).toHaveLength(40)
    const a = buildDeck({ halfEvenNumbers: false })
    a.pop()
    expect(FULL_DECK).toHaveLength(52)
  })
})
