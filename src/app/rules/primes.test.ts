import { describe, expect, it } from 'vitest'
import {
  LARGEST_TWO_CARD_PRIME,
  LAST_CARD_RANKS,
  ONE_CARD_PRIMES,
  TWO_CARD_PRIMES,
  rankWithValue,
} from './primes'

describe('/rules prime lists', () => {
  it('lists the one-card primes 2, 3, 5, 7, J and K', () => {
    expect(ONE_CARD_PRIMES.map(rankWithValue)).toEqual(['2', '3', '5', '7', 'J（11）', 'K（13）'])
  })

  it('lists the 38 two-card primes, the largest being Q·K = 1213', () => {
    expect(TWO_CARD_PRIMES).toHaveLength(38)
    expect(TWO_CARD_PRIMES.slice(0, 3).map((p) => p.value)).toEqual([11, 13, 17])
    expect(TWO_CARD_PRIMES.map((p) => p.value)).toContain(1013)
    expect(TWO_CARD_PRIMES.map((p) => p.value)).not.toContain(57)
    expect(LARGEST_TWO_CARD_PRIME).toEqual({ value: 1213, cards: ['Q', 'K'] })
  })

  it('ends multi-card primes with A, 3, 7, 9, J or K', () => {
    expect(LAST_CARD_RANKS).toEqual(['A', '3', '7', '9', 'J', 'K'])
    for (const p of TWO_CARD_PRIMES) {
      expect(LAST_CARD_RANKS).toContain(p.cards[1])
    }
  })
})
