import { describe, expect, it } from 'vitest'
import { sieveCells } from './og-card'

describe('share card sieve', () => {
  it('lights the 25 primes below 100', () => {
    const cells = sieveCells()
    expect(cells).toHaveLength(100)
    expect(cells[0]).toEqual({ k: 1, prime: false })
    expect(cells.filter((c) => c.prime)).toHaveLength(25)
    expect(cells.find((c) => c.k === 57)?.prime).toBe(false)
  })
})
