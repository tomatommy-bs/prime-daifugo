import { type CardId, type CardSuit, getCardNum, getCardSuit } from '@/game-card/src'
import _ from 'lodash'

export const getCardNumber = (card: CardId): number => {
  switch (getCardNum(card)) {
    case 'A':
      return 1
    case 'J':
      return 11
    case 'Q':
      return 12
    case 'K':
      return 13
    default:
      return _.parseInt(getCardNum(card))
  }
}

export const concatCardNumbers = (cards: CardId[]): number => {
  return _.parseInt(cards.map(getCardNumber).map(_.toString).join(''))
}

const cardSuitToNum: Record<CardSuit, number> = {
  S: 0,
  H: 1,
  C: 2,
  D: 3,
}

export const compareCard = (a: CardId, b: CardId): number => {
  const numCmp = getCardNumber(a) - getCardNumber(b)
  if (numCmp !== 0) {
    return numCmp
  }
  return cardSuitToNum[getCardSuit(a)] - cardSuitToNum[getCardSuit(b)]
}
