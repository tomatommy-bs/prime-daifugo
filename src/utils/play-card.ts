import { type CardId, type CardSuit, getCardNum, getCardSuit, isCardId } from '@/game-card/src'
import { allBasesPrime, isWellFormedFact, parseFact } from '@/game/factor'
import type { FactCardId } from '@/interface/common'
import _ from 'lodash'

/**
 * @example
 * '2C' => 2
 * '10C' => 10
 * 'AC' => 1
 */
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

/**
 * Display-only: returns a JS `number`, which is inexact for numbers of 16+ digits. The rules engine
 * uses the exact BigInt `concatValue` (`src/game/numbers.ts`).
 * @example
 * ['2C', '3C'] => 23
 * ['2C', '3C', '4C'] => 234
 */
export const concatCardNumbers = (cards: CardId[]): number => {
  return _.parseInt(cards.map(getCardNumber).map(_.toString).join(''))
}

/**
 * @example
 * ['2C', '*', '3C'] => '2*3'
 * ['2C', '^', '3C'] => '2^3'
 */
export const concatFactCardIds = (cards: FactCardId[]): string => {
  return cards.map((card) => (isCardId(card) ? getCardNumber(card) : card)).join('')
}

/**
 * @example
 * ['2C', '3C'] => '23'
 * ['2C', '3C', '4C'] => '234'
 * ['2C', '*', '3C'] => '2*3'
 * ['2C', '^', '3C'] => '2**3'
 */
const translateAsEvalString = (cards: FactCardId[]): string => {
  return cards
    .map((card) => (isCardId(card) ? getCardNumber(card) : card === '^' ? '**' : '*'))
    .join('')
}

const evalRegex = /^[1-9]\d*(?:\s*\*{1,2}\s*[1-9]\d*)+$/
/**
 * Loose syntax check used only by the display helper `evalFactCardIds`: alternating numbers and
 * operators, no operand equal to 1. Unlike the rules it accepts `^` towers.
 */
const isEvaluableFactCardIds = (cards: FactCardId[]): boolean => {
  if (cards.length < 2) {
    return false
  }
  const evalString = translateAsEvalString(cards)
  return evalRegex.test(evalString) && !evalString.split('*').includes('1')
}

/**
 * 素因数分解のためのカード配列として有効かどうかを判定する (spec RQ-R16)
 * - カードと * / ^ が交互に並ぶ（隣接するカードは1つの数になる）
 * - 1 を因数・指数に含められない
 * - * または ^ は1つ以上含まれ、両端には置けない
 * - ^ は1段まで（2^3^4 のようなタワーは不可）
 *
 * Delegates to the rules engine (`src/game/factor.ts`), so the UI's pre-validation matches the
 * server exactly.
 */
export const isValidFactCardIds = (cards: FactCardId[]): boolean => {
  return isWellFormedFact(cards)
}

/**
 * isValidFactCardIds に加えて、因数（^ の底を含む）が素数であるかどうかも判定に含める。
 * 指数は素数でなくてもよい。Delegates to `src/game/factor.ts`.
 */
export const isValidFactCardIdsStrict = (cards: FactCardId[]): boolean => {
  const parsed = parseFact(cards)
  return parsed.ok && allBasesPrime(parsed.terms)
}

/**
 * Display-only evaluation of a factor expression for the UI preview (cloudflare では eval が
 * 使えないので、自前で実装する). Returns a JS `number`, so it is inexact above 2^53 and may be
 * `Infinity`; `^` is evaluated right-associatively and towers are accepted. The rules engine never
 * uses it: judging is done with BigInt in `src/game/factor.ts`.
 */
export const evalFactCardIds = (cards: FactCardId[]): number => {
  if (!isEvaluableFactCardIds(cards)) {
    throw new Error('invalid fact card ids')
  }

  const processedCards = cards.map((card) => (isCardId(card) ? getCardNumber(card) : card))
  for (let idx = 0; idx < processedCards.length; idx++) {
    const current = processedCards[idx]
    const next = processedCards[idx + 1]
    if (typeof current === 'number' && typeof next === 'number') {
      processedCards.splice(idx, 2, Number(`${current}${next}`))
      idx--
    }
  }

  while (processedCards.includes('^')) {
    const index = processedCards.lastIndexOf('^')
    const base = processedCards[index - 1]
    const power = processedCards[index + 1]
    // `node:assert` is not available in the browser (Storybook / Vite)
    if (!_.isNumber(base) || !_.isNumber(power)) {
      throw new Error('invalid fact card ids')
    }
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
