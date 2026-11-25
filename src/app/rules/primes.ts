/**
 * Prime lists for the /rules strategy section, computed with the game engine's own
 * `concatValue` and `isPrime`, so the page can never list a number the game would reject.
 */
import type { CardId } from '@/game/cards'
import { concatValue, isPrime } from '@/game/numbers'

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type Rank = (typeof RANKS)[number]

/** Suits never change the value, so clubs stand in for every card. */
const card = (rank: Rank): CardId => `${rank}C` as CardId

export type CardPrime = { value: number; cards: readonly Rank[] }

/** Every prime that `count` cards can form, smallest first, with one way to lay it out. */
export function primesOfCards(count: 1 | 2): CardPrime[] {
  const combos: Rank[][] =
    count === 1 ? RANKS.map((r) => [r]) : RANKS.flatMap((a) => RANKS.map((b) => [a, b]))
  const found = new Map<number, Rank[]>()
  for (const ranks of combos) {
    const value = concatValue(ranks.map(card))
    if (isPrime(value) && !found.has(Number(value))) {
      found.set(Number(value), ranks)
    }
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([value, cards]) => ({ value, cards }))
}

export const ONE_CARD_PRIMES = primesOfCards(1)
export const TWO_CARD_PRIMES = primesOfCards(2)
export const LARGEST_TWO_CARD_PRIME = TWO_CARD_PRIMES[TWO_CARD_PRIMES.length - 1] as CardPrime

/** `J（11）` for court cards and the ace, the plain number otherwise. */
export const rankWithValue = (p: CardPrime): string =>
  p.cards.length === 1 && p.cards[0] !== String(p.value)
    ? `${p.cards[0]}（${p.value}）`
    : String(p.value)

/** The last card of a multi-card prime must end the number in 1, 3, 7 or 9. */
export const LAST_CARD_RANKS: readonly Rank[] = RANKS.filter((r) =>
  ['1', '3', '7', '9'].includes(String(concatValue([card(r)]) % BigInt(10))),
)
