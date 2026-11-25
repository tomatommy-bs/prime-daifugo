/**
 * Numbers (spec §7.2, RQ-R3, RQ-R13).
 *
 * All arithmetic is BigInt so numbers made of up to 52 cards are exact.
 *
 * Primality (`isPrime`):
 * 1. trial division by every prime below 1000 (exact for n < 1_000_000);
 * 2. deterministic Miller-Rabin with bases {2,3,5,7,11,13,17,19,23,29,31,37,41}, which is a
 *    proof of primality for n < 3.317·10^24 (3_317_044_064_679_887_385_961_981);
 * 3. above that bound, additionally a strong Lucas test (Selfridge method A). Together with the
 *    base-2 Miller-Rabin round this is the Baillie-PSW test.
 *
 * BPSW status: no Baillie-PSW pseudoprime is known (checked exhaustively below 2^64), but its
 * correctness for all n is not proven. For n ≥ 3.317·10^24 `isPrime` is therefore a probable-prime
 * test. Such numbers need 25+ digits, i.e. roughly 13 or more cards.
 */
import { FIVE, FOUR, ONE, SEVEN, THREE, TWO, ZERO } from './bigint'
import { type CardId, cardValue } from './cards'

export { cardValue }

/** The Grothendieck prime: 57 is accepted as if it were prime and triggers the 57 cut (RQ-R17). */
export const GROTHENDIECK = BigInt(57)

/** RQ-R3: card values written side by side in play order, e.g. `[Q, A]` → 121n, `[10, 3]` → 103n. */
export function concatValue(cards: readonly CardId[]): bigint {
  if (cards.length === 0) {
    return ZERO
  }
  return BigInt(cards.map(cardValue).join(''))
}

/** Number of binary digits of `n` (0 for n ≤ 0). */
export function bitLength(n: bigint): number {
  return n <= ZERO ? 0 : n.toString(2).length
}

/** Primes below 1000. */
export const SMALL_PRIMES: readonly bigint[] = (() => {
  const limit = 1000
  const sieve = new Array<boolean>(limit).fill(true)
  const out: bigint[] = []
  for (let i = 2; i < limit; i += 1) {
    if (sieve[i]) {
      out.push(BigInt(i))
      for (let j = i * i; j < limit; j += i) {
        sieve[j] = false
      }
    }
  }
  return out
})()

const TRIAL_LIMIT_SQUARED = BigInt(1_000_000)

/** Deterministic Miller-Rabin bound for the bases 2..41 (OEIS A014233). */
export const MR_DETERMINISTIC_BOUND = BigInt('3317044064679887385961981')

const MR_BASES: readonly bigint[] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41].map(BigInt)

/** Non-negative `a mod m`. */
const mod = (a: bigint, m: bigint): bigint => {
  const r = a % m
  return r < ZERO ? r + m : r
}

/** `base^exp mod m` by square-and-multiply. */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = ONE
  let b = mod(base, m)
  let e = exp
  while (e > ZERO) {
    if (e & ONE) {
      result = (result * b) % m
    }
    b = (b * b) % m
    e >>= ONE
  }
  return result % m
}

/** One strong-probable-prime round to `base` for odd n > 2 with `n - 1 = d·2^s`. */
function isStrongProbablePrime(n: bigint, base: bigint, d: bigint, s: number): boolean {
  let x = modPow(base, d, n)
  if (x === ONE || x === n - ONE) {
    return true
  }
  for (let r = 1; r < s; r += 1) {
    x = (x * x) % n
    if (x === n - ONE) {
      return true
    }
  }
  return false
}

/** Miller-Rabin over `bases` for odd n > 41. */
export function millerRabin(n: bigint, bases: readonly bigint[] = MR_BASES): boolean {
  let d = n - ONE
  let s = 0
  while ((d & ONE) === ZERO) {
    d >>= ONE
    s += 1
  }
  return bases.every((base) => isStrongProbablePrime(n, base, d, s))
}

/** Integer square root (floor) of n ≥ 0. */
export function isqrt(n: bigint): bigint {
  if (n < TWO) {
    return n
  }
  let x = BigInt(Math.floor(Math.sqrt(Number(n))))
  // Newton refinement: the float estimate can be off for large n
  for (;;) {
    const y = (x + n / x) >> ONE
    if (y >= x) {
      break
    }
    x = y
  }
  while (x * x > n) {
    x -= ONE
  }
  while ((x + ONE) * (x + ONE) <= n) {
    x += ONE
  }
  return x
}

/** Jacobi symbol (a/n) for odd n > 0. */
export function jacobi(a: bigint, n: bigint): number {
  let x = mod(a, n)
  let y = n
  let result = 1
  while (x !== ZERO) {
    while ((x & ONE) === ZERO) {
      x >>= ONE
      const r = y & SEVEN
      if (r === THREE || r === FIVE) {
        result = -result
      }
    }
    const t = x
    x = y
    y = t
    if ((x & THREE) === THREE && (y & THREE) === THREE) {
      result = -result
    }
    x = mod(x, y)
  }
  return y === ONE ? result : 0
}

/** `x / 2 mod n` for odd n. */
const half = (x: bigint, n: bigint): bigint => {
  const v = mod(x, n)
  return (v & ONE) === ONE ? (v + n) >> ONE : v >> ONE
}

/**
 * Strong Lucas probable-prime test with Selfridge's method A parameters (D = 5, -7, 9, -11, …
 * with (D/n) = -1, P = 1, Q = (1 - D)/4). Precondition: n is odd and has no prime factor below
 * 1000 (as after `isPrime`'s trial division), so every |D| tried is smaller than n. Perfect squares
 * are rejected first because no suitable D exists for them.
 */
export function isStrongLucasProbablePrime(n: bigint): boolean {
  const root = isqrt(n)
  if (root * root === n) {
    return false
  }
  let dAbs = FIVE
  let sign = ONE
  let d = FIVE
  for (;;) {
    d = dAbs * sign
    const j = jacobi(d, n)
    if (j === -1) {
      break
    }
    if (j === 0) {
      // gcd(D, n) > 1, and n > |D| by the precondition, so n is composite
      return false
    }
    dAbs += TWO
    sign = -sign
  }
  const p = ONE
  const q = (ONE - d) / FOUR

  // n + 1 = k · 2^s with k odd
  let k = n + ONE
  let s = 0
  while ((k & ONE) === ZERO) {
    k >>= ONE
    s += 1
  }

  // Lucas sequences U_k, V_k (mod n) by binary expansion of k, starting from index 1
  let u = ONE
  let v = p
  let qk = mod(q, n)
  const bits = k.toString(2)
  for (let i = 1; i < bits.length; i += 1) {
    // index doubles
    u = (u * v) % n
    v = mod(v * v - TWO * qk, n)
    qk = (qk * qk) % n
    if (bits[i] === '1') {
      // index + 1
      const nextU = half(p * u + v, n)
      const nextV = half(d * u + p * v, n)
      u = nextU
      v = nextV
      qk = mod(qk * q, n)
    }
  }
  if (u === ZERO || v === ZERO) {
    return true
  }
  for (let r = 1; r < s; r += 1) {
    v = mod(v * v - TWO * qk, n)
    qk = (qk * qk) % n
    if (v === ZERO) {
      return true
    }
  }
  return false
}

/**
 * Primality of `n` (see the file header for the method and the BPSW caveat).
 * Values below 2 are not prime.
 */
export function isPrime(n: bigint): boolean {
  if (n < TWO) {
    return false
  }
  for (const p of SMALL_PRIMES) {
    if (n === p) {
      return true
    }
    if (n % p === ZERO) {
      return false
    }
  }
  if (n < TRIAL_LIMIT_SQUARED) {
    return true
  }
  if (!millerRabin(n)) {
    return false
  }
  if (n < MR_DETERMINISTIC_BOUND) {
    return true
  }
  return isStrongLucasProbablePrime(n)
}
