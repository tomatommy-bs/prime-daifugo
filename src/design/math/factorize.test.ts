import { describe, expect, it } from 'vitest'
import { factorize, parseConcat } from './factorize'

describe('factorize', () => {
  it('splits composites', () => {
    expect(factorize(221)).toEqual([13, 17])
    expect(factorize(57)).toEqual([3, 19])
    expect(factorize(1102)).toEqual([2, 19, 29])
    expect(factorize(8)).toEqual([2, 2, 2])
  })
  it('returns [p] for a prime', () => {
    expect(factorize(1013)).toEqual([1013])
    expect(factorize(2)).toEqual([2])
  })
  it('returns [] for 0 and 1', () => {
    expect(factorize(0)).toEqual([])
    expect(factorize(1)).toEqual([])
    expect(factorize(BigInt(0))).toEqual([])
  })
  it('returns null for negative or fractional input', () => {
    expect(factorize(-4)).toBeNull()
    expect(factorize(2.5)).toBeNull()
    expect(factorize(-BigInt(4))).toBeNull()
  })
  it('keeps bigint in, bigint out', () => {
    expect(factorize(BigInt(221))).toEqual([BigInt(13), BigInt(17)])
  })
  it('factors a BigInt above MAX_SAFE_INTEGER', () => {
    const n = BigInt(2 ** 30) * BigInt(2 ** 30) * BigInt(3) * BigInt(1013)
    expect(n > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
    const f = factorize(n, 50)
    expect(f).not.toBeNull()
    expect(f?.filter((x) => x === BigInt(2))).toHaveLength(60)
    expect(f?.slice(-2)).toEqual([BigInt(3), BigInt(1013)])
    expect((f as bigint[]).reduce((a, b) => a * b, BigInt(1))).toBe(n)
  })
  it('uses the BigInt path for large numbers', () => {
    expect(factorize(1e12 + 2, 50)).toEqual([2, 3, 166666666667])
  })
  it('returns null when the budget is exceeded', () => {
    // product of two ~1e12 primes: trial division cannot finish in 1 ms
    const n = BigInt(999999999989) * BigInt(1000000000039)
    expect(factorize(n, 1)).toBeNull()
  })
})

describe('parseConcat', () => {
  it('parses safe values as numbers', () => {
    expect(parseConcat('1013')).toBe(1013)
    expect(parseConcat(' 57 ')).toBe(57)
  })
  it('parses huge values as bigint', () => {
    expect(parseConcat('13131313131313131313')).toBe(BigInt('13131313131313131313'))
  })
  it('rejects non-digits', () => {
    expect(() => parseConcat('12a')).toThrow()
    expect(() => parseConcat('')).toThrow()
  })
})
