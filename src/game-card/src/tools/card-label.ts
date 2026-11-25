import { type CardId, type CardSuit, getCardInteger, getCardNum, getCardSuit } from './suit-num'

/** Japanese suit names used in accessible card labels. */
export const SUIT_LABEL_JA: Record<CardSuit, string> = {
  S: 'スペード',
  H: 'ハート',
  C: 'クラブ',
  D: 'ダイヤ',
}

/** Accessible name of the card back (the deck). */
export const BACK_LABEL = '山札'

/**
 * Accessible label for a card: rank as printed, then its value.
 *
 * @example
 * cardLabel('3S') // 'スペードの3, 3'
 * cardLabel('JH') // 'ハートのJ, 11'
 * cardLabel('Back') // '山札'
 */
export function cardLabel(card: CardId | 'Back'): string {
  if (card === 'Back') {
    return BACK_LABEL
  }
  return `${SUIT_LABEL_JA[getCardSuit(card)]}の${getCardNum(card)}, ${getCardInteger(card)}`
}

/** Rank badge for court cards and aces (`J = 11`); `null` for 2–10, where rank = value. */
export function rankBadge(card: CardId | 'Back'): string | null {
  if (card === 'Back') {
    return null
  }
  const num = getCardNum(card)
  if (num === 'A' || num === 'J' || num === 'Q' || num === 'K') {
    return `${num} = ${getCardInteger(card)}`
  }
  return null
}
