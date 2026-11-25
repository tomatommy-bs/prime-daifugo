import { describe, expect, it } from 'vitest'
import { bigPow as pow } from './bigint'

const b = BigInt
import type { CardId } from './cards'
import {
  GROTHENDIECK,
  MR_DETERMINISTIC_BOUND,
  SMALL_PRIMES,
  bitLength,
  concatValue,
  isPrime,
  isStrongLucasProbablePrime,
  isqrt,
  jacobi,
  millerRabin,
  modPow,
} from './numbers'

const naiveIsPrime = (n: number): boolean => {
  if (n < 2) {
    return false
  }
  for (let i = 2; i * i <= n; i += 1) {
    if (n % i === 0) {
      return false
    }
  }
  return true
}

describe('concatValue (RQ-R3)', () => {
  it('writes card values side by side in play order', () => {
    expect(concatValue(['QS', 'AH'])).toBe(b(121))
    expect(concatValue(['10S', '3H'])).toBe(b(103))
    expect(concatValue(['AS', 'KD'])).toBe(b(113))
    expect(concatValue(['2C'])).toBe(b(2))
    expect(concatValue([])).toBe(b(0))
  })

  it('is exact for numbers of 30 and more cards (BigInt)', () => {
    const cards: CardId[] = [
      ...(['KS', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD', 'JS', 'JH'] as const),
      ...(['JC', 'JD', '10S', '10H', '10C', '10D', '9S', '9H', '9C', '9D'] as const),
      ...(['8S', '8H', '8C', '8D', '7S', '7H', '7C', '7D', '6S', '6H', '6C'] as const),
    ]
    expect(cards).toHaveLength(31)
    const value = concatValue(cards)
    expect(value).toBe(BigInt('13131313121212121111111110101010999988887777666'))
    expect(value > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })
})

describe('bitLength', () => {
  it('counts binary digits', () => {
    expect(bitLength(b(0))).toBe(0)
    expect(bitLength(-b(5))).toBe(0)
    expect(bitLength(b(1))).toBe(1)
    expect(bitLength(b(57))).toBe(6)
    expect(bitLength(pow(b(2), 100))).toBe(101)
  })
})

describe('helpers', () => {
  it('SMALL_PRIMES are the 168 primes below 1000', () => {
    expect(SMALL_PRIMES).toHaveLength(168)
    expect(SMALL_PRIMES[0]).toBe(b(2))
    expect(SMALL_PRIMES.at(-1)).toBe(b(997))
  })

  it('modPow', () => {
    expect(modPow(b(2), b(10), b(1000))).toBe(b(24))
    expect(modPow(-b(3), b(3), b(7))).toBe(b(1)) // (-27) mod 7 = 1
    expect(modPow(b(5), b(0), b(1))).toBe(b(0))
  })

  it('isqrt', () => {
    expect(isqrt(b(0))).toBe(b(0))
    expect(isqrt(b(1))).toBe(b(1))
    expect(isqrt(b(15))).toBe(b(3))
    expect(isqrt(b(16))).toBe(b(4))
    const big = pow(pow(b(10), 30) + b(7), 2)
    expect(isqrt(big)).toBe(pow(b(10), 30) + b(7))
    expect(isqrt(big - b(1))).toBe(pow(b(10), 30) + b(6))
  })

  it('jacobi', () => {
    expect(jacobi(b(1), b(3))).toBe(1)
    expect(jacobi(b(2), b(3))).toBe(-1)
    expect(jacobi(b(5), b(21))).toBe(1)
    expect(jacobi(-b(7), b(9))).toBe(1)
    expect(jacobi(b(3), b(9))).toBe(0)
    expect(jacobi(b(1001), b(9907))).toBe(-1)
  })

  it('millerRabin flags strong pseudoprimes only with the right bases', () => {
    // 2047 = 23 * 89 is a strong pseudoprime to base 2
    expect(millerRabin(b(2047), [b(2)])).toBe(true)
    expect(millerRabin(b(2047))).toBe(false)
    // 3215031751 is a strong pseudoprime to bases 2, 3, 5, 7
    expect(millerRabin(b(3215031751), [b(2), b(3), b(5), b(7)])).toBe(true)
    expect(millerRabin(b(3215031751))).toBe(false)
  })

  it('strong Lucas: primes pass, known strong Lucas pseudoprimes pass, composites fail', () => {
    expect(isStrongLucasProbablePrime(b(1009))).toBe(true)
    expect(isStrongLucasProbablePrime(pow(b(2), 89) - b(1))).toBe(true)
    // strong Lucas pseudoprimes (OEIS A217255) — caught by trial division / MR in isPrime
    for (const n of [b(5459), b(5777), b(10877), b(16109), b(18971)]) {
      expect(isStrongLucasProbablePrime(n)).toBe(true)
      expect(isPrime(n)).toBe(false)
    }
    expect(isStrongLucasProbablePrime(b(1003) * b(1009))).toBe(false)
    // perfect squares are rejected up front
    expect(isStrongLucasProbablePrime(b(1009) * b(1009))).toBe(false)
    // gcd(D, n) > 1 during the parameter search (n = 1013 * 7, D = -7)
    expect(isStrongLucasProbablePrime(b(7091))).toBe(false)
  })

  it('strong Lucas agrees with Miller-Rabin on every odd n in [1009, 30000)', () => {
    for (let n = b(1009); n < b(30000); n += b(2)) {
      expect(isStrongLucasProbablePrime(n) || !millerRabin(n)).toBe(true)
    }
  })
})

describe('isPrime', () => {
  it('matches trial division for every n < 20000', () => {
    for (let n = -2; n < 20000; n += 1) {
      expect(isPrime(BigInt(n))).toBe(naiveIsPrime(n))
    }
  })

  it('handles the Miller-Rabin range', () => {
    expect(isPrime(b(1000003))).toBe(true)
    expect(isPrime(b(1000003) * b(1000033))).toBe(false)
    expect(isPrime(pow(b(2), 61) - b(1))).toBe(true)
    expect(isPrime(b(3215031751))).toBe(false)
    expect(isPrime(b(1000000007))).toBe(true)
    // strong pseudoprime to every prime base up to 23 (OEIS A014233); bases 29..41 catch it
    expect(
      millerRabin(b('3825123056546413051'), [
        b(2),
        b(3),
        b(5),
        b(7),
        b(11),
        b(13),
        b(17),
        b(19),
        b(23),
      ]),
    ).toBe(true)
    expect(isPrime(b('3825123056546413051'))).toBe(false)
  })

  it('uses the strong Lucas step at and above 3.317e24 (Baillie-PSW)', () => {
    // the bound itself is a strong pseudoprime to every base 2..41; only the Lucas step rejects it
    expect(b(1287836182261) * b(2575672364521)).toBe(MR_DETERMINISTIC_BOUND)
    expect(millerRabin(MR_DETERMINISTIC_BOUND)).toBe(true)
    expect(isPrime(MR_DETERMINISTIC_BOUND)).toBe(false)
    // Mersenne primes and composites above the bound
    expect(isPrime(pow(b(2), 89) - b(1))).toBe(true)
    expect(isPrime(pow(b(2), 107) - b(1))).toBe(true)
    expect(isPrime(pow(b(2), 127) - b(1))).toBe(true)
    expect(isPrime(pow(b(2), 101) - b(1))).toBe(false)
    expect(isPrime((pow(b(2), 61) - b(1)) * (pow(b(2), 89) - b(1)))).toBe(false)
  })

  it('a 52-card-sized number is judged without overflow', () => {
    expect(isPrime(pow(b(2), 521) - b(1))).toBe(true)
    expect(isPrime(pow(b(2), 521) + b(1))).toBe(false)
  })

  it('GROTHENDIECK is 57 and 57 is not prime', () => {
    expect(GROTHENDIECK).toBe(b(57))
    expect(isPrime(GROTHENDIECK)).toBe(false)
  })
})
