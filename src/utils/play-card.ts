import assert from 'assert'
import { type CardId, type CardSuit, getCardNum, getCardSuit, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
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

export const concatFactCardIds = (cards: FactCardId[]): string => {
  return cards.map((card) => (isCardId(card) ? getCardNumber(card) : card)).join('')
}

const translateAsEvalString = (cards: FactCardId[]): string => {
  return cards
    .map((card) => (isCardId(card) ? getCardNumber(card) : card === '^' ? '**' : '*'))
    .join('')
}
const isEvaluable = (evalString: string): boolean => {
  const regex = /^(\S+)(\s*(\*{1,2})\s*(\S+))*$/g

  return regex.test(evalString)
}
export const isValidFactCardIds = (cards: FactCardId[]): boolean => {
  const evalString = translateAsEvalString(cards)
  if (cards.length === 0 || cards.length === 1) {
    return false
  }
  if (!isEvaluable(evalString)) {
    return false
  }
  // 1 を素因数には含められない
  if (evalString.split('*').includes('1')) {
    return false
  }
  // * が1つもない
  if (!evalString.includes('*')) {
    return false
  }

  return true
}

/**
 * cloudflare では eval が使えないので、自前で実装する
 */
export const evalFactCardIds = (cards: FactCardId[]): number => {
  if (!isValidFactCardIds(cards)) {
    throw new Error('invalid fact card ids')
  }

  const processedCards = cards.map((card) => (isCardId(card) ? getCardNumber(card) : card))
  while (processedCards.includes('^')) {
    const index = processedCards.indexOf('^')
    const base = processedCards[index - 1]
    const power = processedCards[index + 1]
    assert(_.isNumber(base))
    assert(_.isNumber(power))
    processedCards.splice(index - 1, 3, base ** power)
  }

  const numbers = processedCards.filter(_.isNumber)
  return numbers.reduce((acc, num) => acc * num, 1)
}

export const extractCardIdsFromFactCardIds = (factCardIds: FactCardId[]): CardId[] => {
  return factCardIds.filter(isCardId)
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
