/**
 * Cards (spec RQ-R1, RQ-R2, RQ-R5).
 *
 * Pure helpers over the 52 card ids `<num><suit>` (num ∈ A,2..10,J,Q,K; suit ∈ S,H,C,D).
 * No joker. Runtime imports are relative only (spec §15).
 */
import { CARD_IDS, type CardId } from '../shared/ids'
import type { PrimeDaifugoSetupData } from './types'

export type { CardId }

export type CardSuit = 'S' | 'H' | 'C' | 'D'

/** The full 52-card deck in canonical order (S, H, C, D; A..K). */
export const FULL_DECK: readonly CardId[] = CARD_IDS

const CARD_ID_SET: ReadonlySet<string> = new Set<string>(CARD_IDS)

/** True when `token` is one of the 52 card ids. */
export function isCardId(token: unknown): token is CardId {
  return typeof token === 'string' && CARD_ID_SET.has(token)
}

/** The suit letter of a card id. */
export function cardSuit(card: CardId): CardSuit {
  return card.slice(-1) as CardSuit
}

const FACE_VALUES: Readonly<Record<string, number>> = { A: 1, J: 11, Q: 12, K: 13 }

/** Card value (RQ-R2): A=1, J=11, Q=12, K=13, every other card its face value. */
export function cardValue(card: CardId): number {
  const num = card.slice(0, -1)
  return FACE_VALUES[num] ?? Number.parseInt(num, 10)
}

/** The 12 cards removed by `halfEvenNumbers` (RQ-R5): 2,4,6,8,10,Q of hearts and diamonds. */
export const HALF_EVEN_REMOVED: readonly CardId[] = FULL_DECK.filter(
  (card) => cardValue(card) % 2 === 0 && (cardSuit(card) === 'H' || cardSuit(card) === 'D'),
)

const HALF_EVEN_REMOVED_SET: ReadonlySet<CardId> = new Set(HALF_EVEN_REMOVED)

/** Filter for `halfEvenNumbers` (RQ-R5): drops the even hearts and diamonds. */
export function halfEvenNumbers(deck: readonly CardId[]): CardId[] {
  return deck.filter((card) => !HALF_EVEN_REMOVED_SET.has(card))
}

/** The unshuffled deck for a rule: 52 cards, or 40 with `halfEvenNumbers`. */
export function buildDeck(rule: Pick<PrimeDaifugoSetupData, 'halfEvenNumbers'>): CardId[] {
  return rule.halfEvenNumbers ? halfEvenNumbers(FULL_DECK) : FULL_DECK.slice()
}
