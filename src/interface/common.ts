import type { CardId } from '@/game-card/src'
import { z } from 'zod'

export type FactCardId = CardId | '*' | '^'

export const PrimeDaifugoSetupDataSchema = z.object({
  initNumCards: z.number(),
  maxSubmitNumCards: z.number(),
  timeLimit: z.number(),
  halfEvenNumbers: z.boolean(),
})

export type PrimeDaifugoSetupData = z.infer<typeof PrimeDaifugoSetupDataSchema>
