import { describe, expect, it } from 'vitest'
import { bigPow as pow } from './bigint'

const b = BigInt
import {
  type FactToken,
  MAX_FACT_TOKENS,
  allBasesPrime,
  checkFact,
  factCards,
  factEquals,
  isWellFormedFact,
  parseFact,
} from './factor'

const terms = (tokens: FactToken[]) => {
  const parsed = parseFact(tokens)
  if (!parsed.ok) {
    throw new Error(`malformed: ${tokens.join(' ')}`)
  }
  return parsed.terms
}

describe('parseFact (RQ-R16)', () => {
  it('joins adjacent cards and splits terms on *', () => {
    expect(parseFact(['2C', '*', 'AC', '3C'])).toEqual({
      ok: true,
      terms: [
        { base: b(2), exp: b(1) },
        { base: b(13), exp: b(1) },
      ],
    })
    expect(parseFact(['2C', '^', '4D', '*', '3C'])).toEqual({
      ok: true,
      terms: [
        { base: b(2), exp: b(4) },
        { base: b(3), exp: b(1) },
      ],
    })
    expect(parseFact(['3S', '*', '2C', '^', 'AD', '0' as FactToken])).toEqual({ ok: false })
    expect(parseFact(['3S', '*', '2C', '^', 'AD', '2D'])).toEqual({
      ok: true,
      terms: [
        { base: b(3), exp: b(1) },
        { base: b(2), exp: b(12) },
      ],
    })
  })

  it('needs at least one operator', () => {
    expect(parseFact([])).toEqual({ ok: false })
    expect(parseFact(['7S'])).toEqual({ ok: false })
    expect(parseFact(['AS', '3S'])).toEqual({ ok: false })
  })

  it('rejects operators at either end or two in a row', () => {
    expect(parseFact(['*', '3S'])).toEqual({ ok: false })
    expect(parseFact(['3S', '^'])).toEqual({ ok: false })
    expect(parseFact(['3S', '*', '*', '5S'])).toEqual({ ok: false })
    expect(parseFact(['3S', '*', '^', '5S'])).toEqual({ ok: false })
  })

  it('rejects any operand equal to 1, including exponent 1', () => {
    expect(parseFact(['AS', '*', '7S'])).toEqual({ ok: false })
    expect(parseFact(['7S', '^', 'AS'])).toEqual({ ok: false })
    expect(parseFact(['7S', '^', 'AS', '*', '2S'])).toEqual({ ok: false })
  })

  it('rejects towers (one ^ level only)', () => {
    expect(parseFact(['2C', '^', '3C', '^', '2D'])).toEqual({ ok: false })
    expect(parseFact(['3S', '*', '2C', '^', '3C', '^', '2D'])).toEqual({ ok: false })
    // two separate powers are fine
    expect(isWellFormedFact(['2C', '^', '3C', '*', '3D', '^', '2D'])).toBe(true)
  })

  it('rejects unknown tokens', () => {
    expect(parseFact(['2C', '+', '3C'])).toEqual({ ok: false })
    expect(parseFact(['2C', '*', '1C'])).toEqual({ ok: false })
    expect(parseFact(['2C', '*', 3])).toEqual({ ok: false })
  })

  it(`rejects more than ${MAX_FACT_TOKENS} tokens`, () => {
    const atLimit: FactToken[] = ['2S']
    while (atLimit.length < MAX_FACT_TOKENS - 1) {
      atLimit.push('*', '2S')
    }
    atLimit.push('3S') // joins with the last 2S → 23
    expect(atLimit).toHaveLength(MAX_FACT_TOKENS)
    expect(parseFact(atLimit).ok).toBe(true)
    expect(parseFact([...atLimit, '*', '2S']).ok).toBe(false)
  })
})

describe('factEquals (guarded evaluation)', () => {
  it('evaluates products and powers exactly', () => {
    expect(factEquals(terms(['2C', '*', '3C']), b(6))).toBe(true)
    expect(factEquals(terms(['2C', '^', '4D', '*', '3C']), b(48))).toBe(true)
    expect(factEquals(terms(['2C', '^', '4D', '*', '3C']), b(47))).toBe(false)
    expect(factEquals(terms(['2C', '*', '3C']), b(1))).toBe(false)
  })

  it('short-circuits an exponent above bitLength(target) + 1 without computing the power', () => {
    // 13^13131312121212 would be astronomically large; the cap rejects it immediately
    const huge = terms(['KS', '^', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD'])
    expect(huge[0].exp).toBe(b(13131312121212))
    expect(factEquals(huge, b(1000))).toBe(false)
    // just under the cap: 2^11 against 1024 (bitLength 11, cap 12) is evaluated and differs
    expect(factEquals(terms(['2S', '^', 'JS']), b(1024))).toBe(false)
    expect(factEquals(terms(['2S', '^', '10S']), b(1024))).toBe(true)
  })

  it('short-circuits a running product above the target', () => {
    expect(factEquals(terms(['KS', '*', 'KH', '*', 'KC']), b(100))).toBe(false)
    expect(factEquals(terms(['3S', '^', '9S']), b(100))).toBe(false)
  })

  it('works on numbers far beyond 2^53', () => {
    // 2^89 * 3 with a 27-digit target
    const t = terms(['2S', '^', '8S', '9S', '*', '3S'])
    expect(factEquals(t, pow(b(2), 89) * b(3))).toBe(true)
    expect(factEquals(t, pow(b(2), 89) * b(3) + b(1))).toBe(false)
  })
})

describe('checkFact (RQ-R13)', () => {
  it('returns null for a correct prime factorization', () => {
    expect(checkFact(terms(['2D', '*', '3H']), b(6))).toBeNull()
    expect(checkFact(terms(['3S', '*', 'AS', '9S']), b(57))).toBeNull()
    expect(checkFact(terms(['2S', '^', '4S', '*', '5S']), b(80))).toBeNull()
  })

  it('FACT_CONTAIN_NOT_PRIME when a base is not prime but the value is right', () => {
    expect(checkFact(terms(['2D', '*', '4C']), b(8))).toBe('FACT_CONTAIN_NOT_PRIME')
    expect(checkFact(terms(['4S', '^', '2S']), b(16))).toBe('FACT_CONTAIN_NOT_PRIME')
  })

  it('INCORRECT_ANSWER when the value is wrong, and it takes precedence over non-prime bases', () => {
    expect(checkFact(terms(['2D', '*', '3H']), b(8))).toBe('INCORRECT_ANSWER')
    // both checks fail: 2*4 ≠ 9 and 4 is not prime
    expect(checkFact(terms(['2D', '*', '4C']), b(9))).toBe('INCORRECT_ANSWER')
  })

  it('allBasesPrime ignores exponents', () => {
    expect(allBasesPrime(terms(['2C', '^', '4C', '*', '5C']))).toBe(true)
    expect(allBasesPrime(terms(['2C', '*', '4C', '^', '5C']))).toBe(false)
  })
})

describe('factCards', () => {
  it('drops operators', () => {
    expect(factCards(['2C', '*', 'AC', '3C', '^', '2D'])).toEqual(['2C', 'AC', '3C', '2D'])
  })
})
