import { GAME_CONFIG } from '@/constants/config'
import { describe, expect, it } from 'vitest'
import { ALLOWED_RULES, DEFAULT_RULE, isAllowedRule, parseRulePatch } from './rule-options'

describe('DEFAULT_RULE', () => {
  it('comes from GAME_CONFIG and is allowed', () => {
    expect(DEFAULT_RULE).toEqual({
      initNumCards: GAME_CONFIG.initialNumCards,
      maxSubmitNumCards: GAME_CONFIG.maxSubmitNumCards,
      timeLimit: GAME_CONFIG.timeLimit,
      halfEvenNumbers: GAME_CONFIG.halfEvenNumbers,
    })
    expect(isAllowedRule(DEFAULT_RULE)).toBe(true)
  })
})

describe('ALLOWED_RULES', () => {
  it('lists the waiting-room choices (RQ-R22)', () => {
    expect(ALLOWED_RULES).toEqual({
      timeLimit: [15, 60, 300],
      initNumCards: [4, 8, 11],
      maxSubmitNumCards: [4, 52],
      halfEvenNumbers: [false, true],
    })
  })
})

describe('parseRulePatch', () => {
  it.each([
    [{ timeLimit: 15 }],
    [{ timeLimit: 300 }],
    [{ initNumCards: 4 }],
    [{ initNumCards: 8 }],
    [{ maxSubmitNumCards: 52 }],
    [{ halfEvenNumbers: true }],
    [{ timeLimit: 15, initNumCards: 4, maxSubmitNumCards: 52, halfEvenNumbers: true }],
  ])('accepts %j and merges it onto the base', (patch) => {
    const result = parseRulePatch(patch)
    expect(result).toEqual({ ok: true, rule: { ...DEFAULT_RULE, ...patch }, patch })
  })

  it('merges onto the given base', () => {
    const base = { ...DEFAULT_RULE, timeLimit: 15 }
    expect(parseRulePatch({ initNumCards: 4 }, base)).toEqual({
      ok: true,
      rule: { ...base, initNumCards: 4 },
      patch: { initNumCards: 4 },
    })
  })

  it('accepts an empty patch as a no-op copy', () => {
    const result = parseRulePatch({})
    expect(result).toEqual({ ok: true, rule: DEFAULT_RULE, patch: {} })
    expect(result.ok && result.rule).not.toBe(DEFAULT_RULE)
  })

  it('ignores keys explicitly set to undefined', () => {
    expect(parseRulePatch({ timeLimit: undefined })).toEqual({
      ok: true,
      rule: DEFAULT_RULE,
      patch: {},
    })
  })

  it.each([
    [{ timeLimit: 30 }],
    [{ timeLimit: 0 }],
    [{ timeLimit: '60' }],
    [{ initNumCards: 5 }],
    [{ initNumCards: 52 }],
    [{ maxSubmitNumCards: 10 }],
    [{ halfEvenNumbers: 'yes' }],
    [{ halfEvenNumbers: 1 }],
    [{ timeLimit: 60, initNumCards: 5 }],
    [{ unknown: 1 }],
    [{ timeLimit: 60, leftTime: 3 }],
  ])('rejects %j', (patch) => {
    expect(parseRulePatch(patch)).toEqual({ ok: false })
  })

  it.each([null, undefined, 42, 'rule', [], [60]])('rejects a non-object patch (%j)', (patch) => {
    expect(parseRulePatch(patch)).toEqual({ ok: false })
  })
})

describe('isAllowedRule', () => {
  it('rejects a rule with any out-of-set value', () => {
    expect(isAllowedRule({ ...DEFAULT_RULE, timeLimit: 30 })).toBe(false)
    expect(isAllowedRule({ ...DEFAULT_RULE, initNumCards: 5 })).toBe(false)
  })
})
