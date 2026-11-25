import { describe, expect, it } from 'vitest'
import { primesUpTo, sieve, strikingPrime } from './sieve'

describe('sieve', () => {
  it('finds the 25 primes below 100', () => {
    const primes = primesUpTo(100)
    expect(primes).toHaveLength(25)
    expect(primes.slice(0, 5)).toEqual([2, 3, 5, 7, 11])
    expect(primes.at(-1)).toBe(97)
  })
  it('handles the 0/1 edge cases', () => {
    expect(sieve(1)).toEqual([false, false])
    expect(sieve(0)).toEqual([false])
    expect(sieve(-5)).toEqual([false])
    expect(primesUpTo(1)).toEqual([])
    expect(sieve(2)).toEqual([false, false, true])
  })
  it('flags composites', () => {
    const s = sieve(30)
    expect(s[4]).toBe(false)
    expect(s[9]).toBe(false)
    expect(s[29]).toBe(true)
  })
  it('strikingPrime returns the smallest striking pass', () => {
    const passes = [2, 3, 5, 7]
    expect(strikingPrime(12, passes)).toBe(2)
    expect(strikingPrime(15, passes)).toBe(3)
    expect(strikingPrime(49, passes)).toBe(7)
    expect(strikingPrime(7, passes)).toBeNull()
    expect(strikingPrime(97, passes)).toBeNull()
  })
})
