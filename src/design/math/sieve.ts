/**
 * Sieve of Eratosthenes.
 * `sieve(n)[i]` is `true` when `i` is prime, for `0 <= i <= n`.
 */
export function sieve(n: number): boolean[] {
  const size = Math.max(0, Math.floor(n)) + 1
  const isPrime = new Array<boolean>(size).fill(true)
  isPrime[0] = false
  if (size > 1) {
    isPrime[1] = false
  }
  for (let p = 2; p * p < size; p++) {
    if (isPrime[p]) {
      for (let m = p * p; m < size; m += p) {
        isPrime[m] = false
      }
    }
  }
  return isPrime
}

/** All primes `<= n`, ascending. */
export function primesUpTo(n: number): number[] {
  const flags = sieve(n)
  const out: number[] = []
  for (let i = 2; i < flags.length; i++) {
    if (flags[i]) {
      out.push(i)
    }
  }
  return out
}

/**
 * The first prime that strikes `k` out (its smallest prime factor), or `null` for primes,
 * 0 and 1. Used by the animated sieve to decide which pass removes a cell.
 */
export function strikingPrime(k: number, passes: readonly number[]): number | null {
  for (const p of passes) {
    if (k !== p && k % p === 0) {
      return p
    }
  }
  return null
}
