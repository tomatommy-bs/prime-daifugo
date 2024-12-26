import { type CardId, getCardNum } from '@/game-card/src'
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
