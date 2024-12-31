import { evalFactCardIds, isValidFactCardIds, isValidFactCardIdsStrict } from './play-card'

describe('isValidFactCardIds', () => {
  it('returns true when the cards are valid', () => {
    expect(isValidFactCardIds(['10C', '*', '10D'])).toBe(true)
    expect(isValidFactCardIds(['2C', '^', '4D'])).toBe(true)
    expect(isValidFactCardIds(['2C', '*', '4D', '^', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '^', '4D', '*', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '*', '4D', '*', '3C'])).toBe(true)
    expect(isValidFactCardIds(['2C', '^', '4D', '^', '3C'])).toBe(true)
  })

  it("returns false when the cards don't contain * or ^", () => {
    expect(isValidFactCardIds(['10C'])).toBe(false)
    expect(isValidFactCardIds(['10C', '10D'])).toBe(false)
  })

  it('returns false when the cards contain 1', () => {
    expect(isValidFactCardIds(['AC', '*', '10D'])).toBe(false)
    expect(isValidFactCardIds(['10C', '*', 'AC'])).toBe(false)
  })

  it("returns false when the cards don't contain numbers", () => {
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
  it('return false when ^ appears in continuous', () => {})
})

describe('isValidFactCardIdsStrict', () => {
  it('returns true when 指数が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '^', '4C', '*', '5C'])).toBe(true)
  })

  it('returns false when 因数が素数でないとき', () => {
    expect(isValidFactCardIdsStrict(['2C', '*', '4C', '*', '5C'])).toBe(false)
    expect(isValidFactCardIdsStrict(['2C', '*', '4C', '^', '5C'])).toBe(false)
    expect(isValidFactCardIdsStrict(['2C', '^', '4C', '^', '5C'])).toBe(false)
  })
})

describe('evalFactCardIds', () => {
  it('returns the correct result', () => {
    expect(evalFactCardIds(['10C', '*', '10D'])).toBe(10 * 10)
    expect(evalFactCardIds(['2C', '*', '3C'])).toBe(2 * 3)
    expect(evalFactCardIds(['2C', '*', '3C', '*', '4C'])).toBe(2 * 3 * 4)
    expect(evalFactCardIds(['2C', '*', '3C', '^', '2C'])).toBe(2 * 3 ** 2)
    expect(evalFactCardIds(['2C', '*', '2C', '*', '2C'])).toBe(2 * 2 * 2)
    expect(evalFactCardIds(['2C', '*', '3C', '*', '4C'])).toBe(2 * 3 * 4)
    expect(evalFactCardIds(['2C', '^', '3C', '^', '4C'])).toBe(2 ** (3 ** 4))
  })
})
