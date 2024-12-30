import { evalFactCardIds, isValidFactCardIds } from './play-card'

describe('isValidFactCardIds', () => {
  it('returns true when the cards are valid', () => {
    expect(isValidFactCardIds(['10C', '*', '10D'])).toBe(true)
    expect(isValidFactCardIds(['10C', '*', 'JC', '^', '10C'])).toBe(true)
  })

  it("returns false when the cards don't contain *", () => {
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
})

describe('evalFactCardIds', () => {
  it('returns the correct result', () => {
    expect(evalFactCardIds(['10C', '*', '10D'])).toBe(10 * 10)
    expect(evalFactCardIds(['2C', '*', '3C'])).toBe(2 * 3)
    expect(evalFactCardIds(['2C', '*', '3C', '^', '2C'])).toBe(2 * 3 ** 2)
    expect(evalFactCardIds(['2C', '*', '2C', '*', '2C'])).toBe(2 * 2 * 2)
    expect(evalFactCardIds(['2C', '*', '3C', '*', '4C'])).toBe(2 * 3 * 4)
    expect(evalFactCardIds(['2C', '^', '3C', '*', '4C'])).toBe(2 ** 3 * 4)
  })
})
