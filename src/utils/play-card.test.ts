import type { CardId } from '@/game-card/src'
import { isWellFormedFact } from '@/game/factor'
import type { FactCardId } from '@/interface/common'
import { describe, expect, it } from 'vitest'
import {
  compareCard,
  concatCardNumbers,
  evalFactCardIds,
  extractCardIdsFromFactCardIds,
  getCardNumber,
  isValidFactCardIds,
  isValidFactCardIdsStrict,
} from './play-card'

describe('isValidFactCardIds', () => {
  it('returns true when the cards are valid', () => {
    expect(isValidFactCardIds(['10C', '*', '10D'])).toBe(true)
    expect(isValidFactCardIds(['2C', '^', '4D'])).toBe(true)
    expect(isValidFactCardIds(['2C', '*', '4D', '^', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '^', '4D', '*', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '*', '4D', '*', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '*', 'AC', '3C'])).toBe(true)
  })

  it('returns false for towers (one ^ level only, RQ-R16)', () => {
    expect(isValidFactCardIds(['2C', '^', '4D', '^', '3C'])).toBe(false)
  })

  it("returns false when the cards don't contain * or ^", () => {
    expect(isValidFactCardIds(['10C'])).toBe(false)
    expect(isValidFactCardIds(['10C', '10D'])).toBe(false)
  })

  it('returns false when the cards contain 1', () => {
    expect(isValidFactCardIds(['AC', '*', '10D'])).toBe(false)
    expect(isValidFactCardIds(['10C', '*', 'AC'])).toBe(false)
    expect(isValidFactCardIds(['10C', '^', 'AC'])).toBe(false)
  })

  it("returns false when the cards don't contain numbers", () => {
    expect(isValidFactCardIds([])).toBe(false)
    expect(isValidFactCardIds(['*'])).toBe(false)
    expect(isValidFactCardIds(['^'])).toBe(false)
  })

  it('returns false when the cards contain invalid operators', () => {
    expect(isValidFactCardIds(['10C', '*'])).toBe(false)
    expect(isValidFactCardIds(['*', '10C'])).toBe(false)
    expect(isValidFactCardIds(['10C', '^'])).toBe(false)
    expect(isValidFactCardIds(['^', '10C'])).toBe(false)
    expect(isValidFactCardIds(['2C', '^', '^', '2C'])).toBe(false)
    expect(isValidFactCardIds(['2C', '*', '^', '2C'])).toBe(false)
    expect(isValidFactCardIds(['2C', '^', '*', '2C'])).toBe(false)
  })

  it('matches the rules engine exactly (client pre-validation equals the server)', () => {
    const samples: FactCardId[][] = [
      ['2C', '^', '3C', '^', '2D'],
      ['2C', '*', 'AC', '3C'],
      ['AC', '*', '2C'],
      ['2C', '^', '2D', '*', '3S', '^', '2S'],
      ['*', '2C'],
      ['2C'],
    ]
    for (const sample of samples) {
      expect(isValidFactCardIds(sample)).toBe(isWellFormedFact(sample))
    }
  })
})

describe('isValidFactCardIdsStrict', () => {
  it('returns true when 指数が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '^', '4C', '*', '5C'])).toBe(true)
  })

  it('returns true when 2枚以上のカードで表現される要素が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '*', 'AC', '3C'])).toBe(true)
  })

  it('returns false when 2枚以上のカードで表現される要素が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '*', 'AC', '4C'])).toBe(false)
  })

  it('returns false when 因数が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '*', '4C', '*', '5C'])).toBe(false)
    expect(isValidFactCardIdsStrict(['2C', '*', '4C', '^', '5C'])).toBe(false)
  })

  it('returns false for towers (malformed), even with prime bases', () => {
    expect(isValidFactCardIdsStrict(['2C', '^', '4C', '^', '5C'])).toBe(false)
    expect(isValidFactCardIdsStrict(['2C', '^', '3C', '^', '2D'])).toBe(false)
  })

  it('returns false when malformed', () => {
    expect(isValidFactCardIdsStrict(['2C', '*'])).toBe(false)
  })
})

describe('evalFactCardIds (display-only)', () => {
  it('returns the correct result', () => {
    expect(evalFactCardIds(['10C', '*', '10D'])).toBe(10 * 10)
    expect(evalFactCardIds(['2C', '*', '3C'])).toBe(2 * 3)
    expect(evalFactCardIds(['2C', '*', '3C', '*', '4C'])).toBe(2 * 3 * 4)
    expect(evalFactCardIds(['2C', '*', '3C', '^', '2C'])).toBe(2 * 3 ** 2)
    expect(evalFactCardIds(['2C', '*', '2C', '*', '2C'])).toBe(2 * 2 * 2)
    expect(evalFactCardIds(['2C', '*', 'AC', '3C'])).toBe(2 * 13)
    expect(evalFactCardIds(['2C', '*', 'AC', '3C', '*', '3D', 'AD'])).toBe(2 * 13 * 31)
  })

  it('still evaluates towers right-associatively for the preview (the rules reject them)', () => {
    expect(evalFactCardIds(['2C', '^', '3C', '^', '4C'])).toBe(2 ** (3 ** 4))
    expect(isValidFactCardIds(['2C', '^', '3C', '^', '4C'])).toBe(false)
  })

  it('throws on expressions it cannot evaluate', () => {
    expect(() => evalFactCardIds(['2C', '*'])).toThrow()
    expect(() => evalFactCardIds(['2C'])).toThrow()
    expect(() => evalFactCardIds(['AC', '*', '2C'])).toThrow()
  })
})

describe('display helpers', () => {
  it('getCardNumber and concatCardNumbers', () => {
    expect(getCardNumber('AC')).toBe(1)
    expect(getCardNumber('10C')).toBe(10)
    expect(getCardNumber('JC')).toBe(11)
    expect(getCardNumber('QC')).toBe(12)
    expect(getCardNumber('KC')).toBe(13)
    expect(concatCardNumbers(['2C', '3C', '4C'])).toBe(234)
  })

  it('extractCardIdsFromFactCardIds', () => {
    expect(extractCardIdsFromFactCardIds(['2C', '^', '3C', '*', 'KD'])).toEqual(['2C', '3C', 'KD'])
  })

  it('compareCard orders by value, then suit S<H<C<D', () => {
    const cards: CardId[] = ['KD', '2H', '2S', 'AD']
    expect(cards.sort(compareCard)).toEqual(['AD', '2S', '2H', 'KD'])
  })
})
