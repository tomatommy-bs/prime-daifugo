/**
 * Mode 1: is the number made by these cards prime?
 *
 * Half the questions are primes. Most composites are "tricky": odd and not ending in 5, so the
 * last digit alone never gives them away.
 */
import { type CardId, type Rng, concat, deal, isPrimeSmall, primePowers } from './cards'
import { type Level, PRIME_CARDS } from './levels'

export type PrimeQuestion = { cards: CardId[]; value: number; prime: boolean }

export type PrimeAnswer = 'prime' | 'composite'

/** Share of composites that end in 1, 3, 7 or 9. */
const TRICKY_SHARE = 0.8

const MAX_TRIES = 2000

const isTricky = (n: number) => n % 2 !== 0 && n % 5 !== 0

/**
 * A fresh question. `seen` holds values already asked in this run; they are avoided while
 * possible.
 */
export function primeQuestion(
  rng: Rng,
  level: Level,
  seen: ReadonlySet<number> = new Set(),
): PrimeQuestion {
  const k = PRIME_CARDS[level]
  const wantPrime = rng.next() < 0.5
  const wantTricky = rng.next() < TRICKY_SHARE
  let fallback: PrimeQuestion | null = null
  for (let i = 0; i < MAX_TRIES; i += 1) {
    const cards = deal(rng, k)
    const value = concat(cards)
    const prime = isPrimeSmall(value)
    if (value === 1) {
      continue
    }
    const question = { cards, value, prime }
    fallback ??= question
    if (seen.has(value) || prime !== wantPrime) {
      continue
    }
    if (!prime && wantTricky && !isTricky(value)) {
      continue
    }
    return question
  }
  return fallback as PrimeQuestion
}

export const isCorrectPrimeAnswer = (q: PrimeQuestion, answer: PrimeAnswer): boolean =>
  (answer === 'prime') === q.prime

/** `[[2, 2], [3, 1]]` for 12; empty for a prime. */
export const explainComposite = (q: PrimeQuestion): [number, number][] =>
  q.prime ? [] : primePowers(q.value)
