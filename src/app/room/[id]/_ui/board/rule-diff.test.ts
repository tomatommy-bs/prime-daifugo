import { DEFAULT_RULE } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import { RULE_ORDER, formatRuleValue, ruleDiff } from './rule-diff'

describe('ruleDiff', () => {
  it.each([
    [{ timeLimit: 60 }, { timeLimit: 15 }, 't: 60 → 15 s'],
    [{ initNumCards: 8 }, { initNumCards: 11 }, '|H₀|: 8 → 11'],
    [{ maxSubmitNumCards: 4 }, { maxSubmitNumCards: 52 }, 'k_max: 4 → ∞'],
    [{ maxSubmitNumCards: 52 }, { maxSubmitNumCards: 4 }, 'k_max: ∞ → 4'],
    [{ halfEvenNumbers: false }, { halfEvenNumbers: true }, '偶数半減: OFF → ON'],
  ])('%o → %o reads %s', (prev, next, line) => {
    expect(ruleDiff({ ...DEFAULT_RULE, ...prev }, next)).toEqual([line])
  })

  it('skips unchanged and missing keys', () => {
    expect(ruleDiff(DEFAULT_RULE, { timeLimit: DEFAULT_RULE.timeLimit })).toEqual([])
    expect(ruleDiff(DEFAULT_RULE, {})).toEqual([])
  })

  it('lists several changes in axiom order', () => {
    expect(
      ruleDiff(
        { ...DEFAULT_RULE, timeLimit: 60, halfEvenNumbers: false },
        { halfEvenNumbers: true, timeLimit: 300 },
      ),
    ).toEqual(['t: 60 → 300 s', '偶数半減: OFF → ON'])
  })

  it('shows a dash when the previous value is unknown', () => {
    expect(ruleDiff(null, { initNumCards: 4 })).toEqual(['|H₀|: — → 4'])
  })
})

describe('formatRuleValue (shared with the waiting room)', () => {
  it('formats each rule the same way the axioms and the log do', () => {
    expect(formatRuleValue('timeLimit', 60)).toBe('60 s')
    expect(formatRuleValue('timeLimit', 60, { withUnit: false })).toBe('60')
    expect(formatRuleValue('maxSubmitNumCards', 52)).toBe('∞')
    expect(formatRuleValue('maxSubmitNumCards', 4)).toBe('4')
    expect(formatRuleValue('halfEvenNumbers', true)).toBe('ON')
    expect(formatRuleValue('initNumCards', undefined)).toBe('—')
  })
  it('RULE_ORDER lists every rule once', () => {
    expect(RULE_ORDER).toEqual([
      'timeLimit',
      'initNumCards',
      'maxSubmitNumCards',
      'halfEvenNumbers',
    ])
  })
})
