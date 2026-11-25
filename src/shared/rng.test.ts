import { describe, expect, it } from 'vitest'
import { cryptoRng, mulberry32, randomInt, shuffle } from './rng'

const take = (rng: { next(): number }, n: number) => Array.from({ length: n }, () => rng.next())

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    expect(take(mulberry32(42), 20)).toEqual(take(mulberry32(42), 20))
  })

  it('differs between seeds', () => {
    expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5))
  })

  it('pins the first values for seed 1 (golden)', () => {
    const values = take(mulberry32(1), 3)
    expect(values).toMatchInlineSnapshot(`
      [
        0.6270739405881613,
        0.002735721180215478,
        0.5274470399599522,
      ]
    `)
  })

  it('stays in [0, 1)', () => {
    for (const v of take(mulberry32(7), 2000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('cryptoRng', () => {
  it('produces values in [0, 1) across buffer refills', () => {
    const values = take(cryptoRng(), 200)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(values).size).toBeGreaterThan(190)
  })
})

describe('randomInt', () => {
  it('maps the rng into [0, n)', () => {
    expect(randomInt({ next: () => 0 }, 5)).toBe(0)
    expect(randomInt({ next: () => 0.999999 }, 5)).toBe(4)
    expect(randomInt({ next: () => 1 }, 5)).toBe(4)
  })
})

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const out = shuffle(input, mulberry32(3))
    expect(out).not.toBe(input)
    expect([...out].sort((a, b) => a - b)).toEqual([...input])
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('is deterministic for a seeded rng', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(shuffle(input, mulberry32(9))).toEqual(shuffle(input, mulberry32(9)))
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], mulberry32(1))).toEqual([])
    expect(shuffle(['x'], mulberry32(1))).toEqual(['x'])
  })

  it('reaches every permutation of 3 elements', () => {
    const rng = mulberry32(11)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      seen.add(shuffle([1, 2, 3], rng).join(''))
    }
    expect(seen.size).toBe(6)
  })
})
