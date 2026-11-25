/**
 * Factor cases ported from `src/utils/play-card.test.ts` (spec §7.4, RQ-R21), now run against the
 * rules engine's `src/game/factor.ts`.
 *
 * Ported cases (by source `it`):
 *   isValidFactCardIds        5 its (17 assertions) + 1 empty it
 *   isValidFactCardIdsStrict  4 its (6 assertions)
 *   ---------------------------------------------------------------
 *   total                     9 its ported (23 assertions), 1 empty it replaced
 *
 * Intentional differences (marked `// CHANGED:` below):
 *   - `2^4^3`-style towers are malformed now (RQ-R16, one `^` level only).
 *   - `2^4^5` in the strict suite: was invalid because "the middle element is not prime"; it is
 *     still invalid, but because towers are malformed.
 *   - the empty `return false when ^ appears in continuous` it is filled in (rules §8.17 hygiene).
 * The `evalFactCardIds` cases stay in `src/utils/play-card.test.ts` (display-only helper).
 */
import { describe, expect, it } from 'vitest'
import { type FactToken, allBasesPrime, isWellFormedFact, parseFact } from './factor'

/** `isValidFactCardIdsStrict` semantics: well formed and every base prime. */
const isStrict = (tokens: FactToken[]): boolean => {
  const parsed = parseFact(tokens)
  return parsed.ok && allBasesPrime(parsed.terms)
}

describe('ported: isValidFactCardIds → isWellFormedFact', () => {
  it('returns true when the cards are valid', () => {
    expect(isWellFormedFact(['10C', '*', '10D'])).toBe(true)
    expect(isWellFormedFact(['2C', '^', '4D'])).toBe(true)
    expect(isWellFormedFact(['2C', '*', '4D', '^', '3C'])).toBe(true)
    expect(isWellFormedFact(['2C', '^', '4D', '*', '3C'])).toBe(true)
    expect(isWellFormedFact(['2C', '*', '4D', '*', '3C'])).toBe(true)
    // CHANGED: towers are malformed (RQ-R16, one `^` level only); was true
    expect(isWellFormedFact(['2C', '^', '4D', '^', '3C'])).toBe(false)
    expect(isWellFormedFact(['2C', '*', 'AC', '3C'])).toBe(true)
  })

  it("returns false when the cards don't contain * or ^", () => {
    expect(isWellFormedFact(['10C'])).toBe(false)
    expect(isWellFormedFact(['10C', '10D'])).toBe(false)
  })

  it('returns false when the cards contain 1', () => {
    expect(isWellFormedFact(['AC', '*', '10D'])).toBe(false)
    expect(isWellFormedFact(['10C', '*', 'AC'])).toBe(false)
  })

  it("returns false when the cards don't contain numbers", () => {
    expect(isWellFormedFact(['*'])).toBe(false)
    expect(isWellFormedFact(['^'])).toBe(false)
  })

  it('returns false when the cards contain invalid operators', () => {
    expect(isWellFormedFact(['10C', '*'])).toBe(false)
    expect(isWellFormedFact(['*', '10C'])).toBe(false)
    expect(isWellFormedFact(['10C', '^'])).toBe(false)
    expect(isWellFormedFact(['^', '10C'])).toBe(false)
    expect(isWellFormedFact(['2C', '^', '^', '2C'])).toBe(false)
    expect(isWellFormedFact(['2C', '*', '^', '2C'])).toBe(false)
    expect(isWellFormedFact(['2C', '^', '*', '2C'])).toBe(false)
  })

  // CHANGED: the source `it` was empty (rules §8.17); it now asserts what its title says
  it('return false when ^ appears in continuous', () => {
    expect(isWellFormedFact(['2C', '^', '^', '3C'])).toBe(false)
    expect(isWellFormedFact(['2C', '^', '3C', '^', '2D'])).toBe(false)
  })
})

describe('ported: isValidFactCardIdsStrict → well formed + prime bases', () => {
  it('returns true when 指数が素数でないとき', () => {
    expect(isStrict(['2C', '^', '4C', '*', '5C'])).toBe(true)
  })

  it('returns true when 2枚以上のカードで表現される要素が素数でないとき', () => {
    expect(isStrict(['2C', '*', 'AC', '3C'])).toBe(true)
  })

  it('returns false when 2枚以上のカードで表現される要素が素数でないとき', () => {
    expect(isStrict(['2C', '*', 'AC', '4C'])).toBe(false)
  })

  it('returns false when 因数が素数でないとき', () => {
    expect(isStrict(['2C', '*', '4C', '*', '5C'])).toBe(false)
    expect(isStrict(['2C', '*', '4C', '^', '5C'])).toBe(false)
    // CHANGED: still false, but because towers are malformed, not because 4 is not prime
    expect(isStrict(['2C', '^', '4C', '^', '5C'])).toBe(false)
    expect(isWellFormedFact(['2C', '^', '4C', '^', '5C'])).toBe(false)
  })
})
