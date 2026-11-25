import type { CardId } from '@/game-card/src'

export type FactCardId = CardId | '*' | '^'

/**
 * Room rule values. A plain type: the allowed values and the validation live in
 * `src/shared/rule-options.ts` (`ALLOWED_RULES`, `parseRulePatch`) and `src/shared/protocol.ts`.
 */
export type PrimeDaifugoSetupData = {
  initNumCards: number
  maxSubmitNumCards: number
  timeLimit: number
  halfEvenNumbers: boolean
}
