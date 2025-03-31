import assert from 'assert'
import { type CardId, type CardSuit, getCardNum, getCardSuit, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import _ from 'lodash'
import { isPrime } from './prime'

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

const evalRegex = /^[1-9]\d*(?:\s*\*{1,2}\s*[1-9]\d*)+$/
const isEvaluable = (evalString: string): boolean => {
  return evalRegex.test(evalString)
}

/**
 * 素因数分解のためのカード配列として有効かどうかを判定する
 * - 1 を素因数には含められない
 * - * または ^ は1つ以上含まれる
 */
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

const regExAsterisk = /(\*|\^)/

/**
 * isValidFactCardIds に加えて、因数が素数であるかどうかも判定に含める
 */
export const isValidFactCardIdsStrict = (cards: FactCardId[]): boolean => {
  if (!isValidFactCardIds(cards)) {
    return false
  }

  const facts = _.flatten(concatFactCardIds(cards).split(regExAsterisk))
  for (let idx = 0; idx < facts.length; idx += 2) {
    const target = _.parseInt(facts[idx])
    const former = facts[idx - 1] ?? '*' // 0番目の場合は * とする
    const latter = facts[idx + 1] ?? '*' // 最後の場合は * とする

    if (_.isNaN(target)) {
      throw new Error(`invalid number: ${target}`)
    }

    if (former === '*' && latter === '*') {
      if (!isPrime(target)) {
        return false
      }
    }

    // 指数の基底が素数でない場合は false
    if (former === '*' && latter === '^') {
      if (!isPrime(target)) {
        return false
      }
    }

    // 指数は素数でなくてもよい
    if (former === '^' && latter === '*') {
      null
    }

    if (former === '^' && latter === '^') {
      if (!isPrime(target)) {
        return false
      }
    }
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
    const index = processedCards.lastIndexOf('^')
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
