/**
 * Card helpers shared by the training modes.
 *
 * Training numbers are at most 8 digits (4 cards), so plain `number` arithmetic is exact. The
 * primality test here is a small trial division that must agree with the engine's `isPrime`
 * (`src/game/numbers.ts`), checked in `cards.test.ts`: it exists only because the generators
 * test tens of thousands of candidates and the engine's BigInt path is slow for that.
 */
import { type CardId, FULL_DECK, cardValue } from '@/game/cards'
import { type Rng, randomInt, shuffle } from '@/shared/rng'

export type { CardId, Rng }
export { cardValue }

/** The Grothendieck prime: playable as if prime (RQ-R17), though 57 = 3 · 19. */
export const GROTHENDIECK = 57

/** Card values written side by side: `[Q, A]` → 121. */
export const concat = (cards: readonly CardId[]): number =>
  cards.length === 0 ? 0 : Number(cards.map(cardValue).join(''))

/** Primality for 0 ≤ n < 2^53 by trial division (fast enough for n ≤ 13131313). */
export function isPrimeSmall(n: number): boolean {
  if (n < 2) {
    return false
  }
  if (n % 2 === 0) {
    return n === 2
  }
  if (n % 3 === 0) {
    return n === 3
  }
  for (let d = 5; d * d <= n; d += 6) {
    if (n % d === 0 || n % (d + 2) === 0) {
      return false
    }
  }
  return true
}

/** What the game accepts as a plain submit: a prime, or 57. */
export const isPlayable = (n: number): boolean => n === GROTHENDIECK || isPrimeSmall(n)

/** Prime factors with multiplicity, ascending: `12 → [[2, 2], [3, 1]]`. */
export function primePowers(n: number): [p: number, e: number][] {
  const out: [number, number][] = []
  let rest = n
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    let e = 0
    while (rest % p === 0) {
      rest /= p
      e += 1
    }
    if (e > 0) {
      out.push([p, e])
    }
  }
  if (rest > 1) {
    out.push([rest, 1])
  }
  return out
}

/** Deal `count` distinct cards from the 52-card deck. */
export const deal = (rng: Rng, count: number, from: readonly CardId[] = FULL_DECK): CardId[] =>
  shuffle(from, rng).slice(0, count)

/** One element of `items`, uniformly. */
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[randomInt(rng, items.length)]

/** Every ordered selection of `k` distinct items (k-permutations). */
export function* permutations<T>(items: readonly T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield []
    return
  }
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const tail of permutations(rest, k - 1)) {
      yield [items[i], ...tail]
    }
  }
}

/** Order cards for display: by value, then suit order of the deck. */
export const sortHand = (cards: readonly CardId[]): CardId[] =>
  [...cards].sort(
    (a, b) => cardValue(a) - cardValue(b) || FULL_DECK.indexOf(a) - FULL_DECK.indexOf(b),
  )
