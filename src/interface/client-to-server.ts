import type { CardId } from '@/game-card/src'
import { z } from 'zod'

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

const roomEventSchema = z.object({
  event: z.literal('room'),
  action: z.union([z.literal('set-ready'), z.literal('unset-ready'), z.literal('start-game')]),
})
export type RoomEvent = z.infer<typeof roomEventSchema>

export const submitCardSetSchema = z.object({
  submit: z.array(z.string() as z.ZodType<CardId>),
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
