/**
 * Rule options (spec RQ-R22, RQ-S11). The server stores the rule and accepts only these values.
 */
import type { PrimeDaifugoSetupData } from '@/interface/common'
import { GAME_CONFIG } from '../constants/config'

/** Every value the server accepts for each rule key (the waiting-room choices). */
export const ALLOWED_RULES = {
  timeLimit: [15, 60, 300],
  initNumCards: [4, 8, 11],
  maxSubmitNumCards: [4, 52],
  halfEvenNumbers: [false, true],
} as const satisfies { [K in keyof PrimeDaifugoSetupData]: readonly PrimeDaifugoSetupData[K][] }

export type RuleKey = keyof typeof ALLOWED_RULES

export const RULE_KEYS = Object.keys(ALLOWED_RULES) as RuleKey[]

/** The rule a fresh room starts with (from `GAME_CONFIG`). */
export const DEFAULT_RULE: PrimeDaifugoSetupData = Object.freeze({
  initNumCards: GAME_CONFIG.initialNumCards,
  maxSubmitNumCards: GAME_CONFIG.maxSubmitNumCards,
  timeLimit: GAME_CONFIG.timeLimit,
  halfEvenNumbers: GAME_CONFIG.halfEvenNumbers,
})

export type RulePatchResult =
  | { ok: true; rule: PrimeDaifugoSetupData; patch: Partial<PrimeDaifugoSetupData> }
  | { ok: false }

const isAllowedValue = (key: RuleKey, value: unknown): boolean =>
  (ALLOWED_RULES[key] as readonly unknown[]).includes(value)

/** True when every key of `rule` holds an allowed value. */
export function isAllowedRule(rule: PrimeDaifugoSetupData): boolean {
  return RULE_KEYS.every((key) => isAllowedValue(key, rule[key]))
}

/**
 * Validate a `set-rule` patch and merge it onto `base`.
 * - `patch` must be a plain object whose keys are rule keys with allowed values.
 * - Unknown keys or any out-of-set value reject the whole patch (`{ ok: false }`).
 * - An empty patch is accepted and returns `base` unchanged (as a copy).
 * Returns the merged full `rule` and the validated `patch`.
 */
export function parseRulePatch(
  patch: unknown,
  base: PrimeDaifugoSetupData = DEFAULT_RULE,
): RulePatchResult {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false }
  }
  const valid: Partial<Record<RuleKey, unknown>> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!(RULE_KEYS as string[]).includes(key)) {
      return { ok: false }
    }
    if (value === undefined) {
      continue
    }
    if (!isAllowedValue(key as RuleKey, value)) {
      return { ok: false }
    }
    valid[key as RuleKey] = value
  }
  const typed = valid as Partial<PrimeDaifugoSetupData>
  return { ok: true, rule: { ...base, ...typed }, patch: typed }
}
