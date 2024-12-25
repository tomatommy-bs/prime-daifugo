import type { CardId } from '@/game-card/src'
import { z } from 'zod'

export type PrimeDaifugoGameState = z.infer<typeof PrimeDaifugoGameStateSchema>

export const PrimeDaifugoGameStateSchema = z.object({
  players: z.record(
    z.object({
      hand: z.array(z.string() as z.ZodType<CardId>),
      drawRight: z.boolean(),
    }),
  ),
  field: z.array(z.array(z.string() as z.ZodType<CardId>)),
  deck: z.array(z.string() as z.ZodType<CardId>),
})
