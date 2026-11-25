import pf from 'primes-and-factors'

/** Numbers at or below this go through `primes-and-factors` (fast, synchronous). */
const PF_LIMIT = 1e12
/** Trial divisors never exceed this; beyond it the factorization is abandoned. */
export const TRIAL_DIVISOR_CAP = 1e15

const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const SIX = BigInt(6)

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * Prime factors of `n` with multiplicity, ascending: `221 → [13, 17]`, `0` and `1` → `[]`.
 *
 * - Values up to 1e12 use the existing `primes-and-factors` dependency.
 * - Larger values (including BigInt above MAX_SAFE_INTEGER) use budgeted BigInt trial
 *   division and return `null` when `budgetMs` or the 1e15 trial-divisor cap is exceeded.
 * - A `number` input yields numbers; a `bigint` input yields bigints.
 * - Negative or non-integer input returns `null`.
 *
 * Only call this AFTER a server result: it is a primality oracle.
 */
export function factorize(n: number | bigint, budgetMs = 5): (number | bigint)[] | null {
  const asBigInt = typeof n === 'bigint'
  if (!asBigInt && (!Number.isInteger(n) || n < 0)) {
    return null
  }
  const big = asBigInt ? (n as bigint) : BigInt(n)
  if (big < ZERO) {
    return null
  }
  if (big < TWO) {
    return []
  }
  if (big <= BigInt(PF_LIMIT)) {
    const factors = pf.getFactors(Number(big))
    return asBigInt ? factors.map((f) => BigInt(f)) : factors
  }
  const factors = trialDivision(big, budgetMs)
  if (factors === null) {
    return null
  }
  if (asBigInt) {
    return factors
  }
  return factors.map((f) => (f <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(f) : f))
}

function trialDivision(input: bigint, budgetMs: number): bigint[] | null {
  const start = now()
  const cap = BigInt(TRIAL_DIVISOR_CAP)
  const out: bigint[] = []
  let rest = input
  for (const p of [TWO, BigInt(3)]) {
    while (rest % p === ZERO) {
      out.push(p)
      rest /= p
    }
  }
  // wheel 6k ± 1
  let d = BigInt(5)
  let iterations = 0
  while (d * d <= rest) {
    for (const c of [d, d + TWO]) {
      while (rest % c === ZERO) {
        out.push(c)
        rest /= c
      }
    }
    d += SIX
    if (d > cap) {
      return null
    }
    iterations++
    if ((iterations & 1023) === 0 && now() - start > budgetMs) {
      return null
    }
  }
  if (rest > ONE) {
    out.push(rest)
  }
  return out
}

/**
 * Parse a concatenated card value (`"1013"`) as a number, or a BigInt when it exceeds
 * `Number.MAX_SAFE_INTEGER`.
 */
export function parseConcat(str: string): number | bigint {
  const s = str.trim()
  if (!/^\d+$/.test(s)) {
    throw new Error(`not a digit string: ${str}`)
  }
  const big = BigInt(s)
  return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big
}
