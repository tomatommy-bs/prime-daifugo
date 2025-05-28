import type { CardId } from '@/game-card/src'
import { z } from 'zod'
import { type FactCardId, PrimeDaifugoSetupDataSchema } from './common'

const chatEventSchema = z.object({
  event: z.literal('chat'),
  message: z.string(),
})
export type ChatEvent = z.infer<typeof chatEventSchema>

const setNameEventSchema = z.object({
  event: z.literal('set-name'),
  name: z.string(),
})
export type SetNameEvent = z.infer<typeof setNameEventSchema>

const roomEventSchema = z.discriminatedUnion('action', [
  z.object({
    event: z.literal('room'),
    action: z.literal('set-ready'),
  }),
  z.object({
    event: z.literal('room'),
    action: z.literal('unset-ready'),
  }),
  z.object({
    event: z.literal('room'),
    action: z.literal('start-game'),
    rule: PrimeDaifugoSetupDataSchema.optional(),
  }),
  z.object({
    event: z.literal('room'),
    action: z.literal('change-rule'),
    rule: PrimeDaifugoSetupDataSchema.partial(),
  }),
])
export type RoomEvent = z.infer<typeof roomEventSchema>

export const submitCardSetSchema = z.object({
  submit: z.array(z.string() as z.ZodType<CardId>),
  factor: z.array(z.string() as z.ZodType<FactCardId>),
})
export type SubmitCardSet = z.infer<typeof submitCardSetSchema>
const gameEventSchema = z.union([
  z.object({
    event: z.literal('game'),
    action: z.union([z.literal('draw'), z.literal('pass')]),
  }),
  z.object({
    event: z.literal('game'),
    action: z.literal('submit'),
    submitCardSet: submitCardSetSchema,
  }),
])
export type GameEvent = z.infer<typeof gameEventSchema>

export const clientToServerSchema = z.union([
  chatEventSchema,
  setNameEventSchema,
  roomEventSchema,
  gameEventSchema,
])
export type ClientToServer = z.infer<typeof clientToServerSchema>
