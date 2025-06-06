import _ from 'lodash'

export const cardSuit = {
  S: 'S',
  H: 'H',
  C: 'C',
  D: 'D',
} as const

export const cardNum = {
  A: 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
} as const

export const cardId = {
  AS: 'AS',
  '2S': '2S',
  '3S': '3S',
  '4S': '4S',
  '5S': '5S',
  '6S': '6S',
  '7S': '7S',
  '8S': '8S',
  '9S': '9S',
  '10S': '10S',
  JS: 'JS',
  QS: 'QS',
  KS: 'KS',
  AH: 'AH',
  '2H': '2H',
  '3H': '3H',
  '4H': '4H',
  '5H': '5H',
  '6H': '6H',
  '7H': '7H',
  '8H': '8H',
  '9H': '9H',
  '10H': '10H',
  JH: 'JH',
  QH: 'QH',
  KH: 'KH',
  AC: 'AC',
  '2C': '2C',
  '3C': '3C',
  '4C': '4C',
  '5C': '5C',
  '6C': '6C',
  '7C': '7C',
  '8C': '8C',
  '9C': '9C',
  '10C': '10C',
  JC: 'JC',
  QC: 'QC',
  KC: 'KC',
  AD: 'AD',
  '2D': '2D',
  '3D': '3D',
  '4D': '4D',
  '5D': '5D',
  '6D': '6D',
  '7D': '7D',
  '8D': '8D',
  '9D': '9D',
  '10D': '10D',
  JD: 'JD',
  QD: 'QD',
  KD: 'KD',
} as const

export const cardIds = [
  'AS',
  '2S',
  '3S',
  '4S',
  '5S',
  '6S',
  '7S',
  '8S',
  '9S',
  '10S',
  'JS',
  'QS',
  'KS',
  'AH',
  '2H',
  '3H',
  '4H',
  '5H',
  '6H',
  '7H',
  '8H',
  '9H',
  '10H',
  'JH',
  'QH',
  'KH',
  'AC',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  '10C',
  'JC',
  'QC',
  'KC',
  'AD',
  '2D',
  '3D',
  '4D',
  '5D',
  '6D',
  '7D',
  '8D',
  '9D',
  '10D',
  'JD',
  'QD',
  'KD',
] as const

export const cardIdSet = new Set(cardIds)

export type CardSuit = (typeof cardSuit)[keyof typeof cardSuit]
export type CardNum = (typeof cardNum)[keyof typeof cardNum]
export type CardId = (typeof cardIds)[number]

export function getCardSuit(cardId: CardId): CardSuit {
  return _.nth(cardId, -1) as CardSuit
}
export function getCardNum(cardId: CardId): CardNum {
  if (cardId.startsWith('10')) {
    return '10'
  }
  return cardId[0] as CardNum
}
export function getCardInteger(cardId: CardId): number {
  const num = getCardNum(cardId)
  switch (num) {
    case 'A':
      return 1
    case 'J':
      return 11
    case 'Q':
      return 12
    case 'K':
      return 13
    default:
      return Number(num)
  }
}
export const isCardId = (cardId: string): cardId is CardId => cardIdSet.has(cardId as CardId)
