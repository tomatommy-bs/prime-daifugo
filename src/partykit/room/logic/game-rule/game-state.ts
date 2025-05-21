import type { CardId } from '@/game-card/src'
import { z } from 'zod'

export type PrimeDaifugoGameState = z.infer<typeof PrimeDaifugoGameStateSchema>
export enum LAST_SUBMIT_ERROR {
  /** 提出した値が素数でない */
  BASE_IS_NOT_PRIME = 'BASE_IS_NOT_PRIME',
  /** 素因数分解の最低限のルールが守られていない */
  INVALID_FACT = 'INVALID_FACT',
  /** 素因数分解で構成されている値が素数でない */
  FACT_CONTAIN_NOT_PRIME = 'FACT_CONTAIN_NOT_PRIME',
  /** 素因数分解の計算結果が間違っている */
  INCORRECT_ANSWER = 'INCORRECT_ANSWER',
}

export const PrimeDaifugoGameStateSchema = z.object({
  players: z.record(
    z.object({
      hand: z.array(z.string() as z.ZodType<CardId>),
      drawRight: z.boolean(),
    }),
  ),
  field: z.array(z.array(z.string() as z.ZodType<CardId>)),
  deck: z.array(z.string() as z.ZodType<CardId>),
  deckTopPlayer: z.string().nullable(),
  lastSubmitError: z
    .enum([
      LAST_SUBMIT_ERROR.BASE_IS_NOT_PRIME,
      LAST_SUBMIT_ERROR.INVALID_FACT,
      LAST_SUBMIT_ERROR.FACT_CONTAIN_NOT_PRIME,
      LAST_SUBMIT_ERROR.INCORRECT_ANSWER,
    ])
    .nullable(),
})
