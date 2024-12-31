import { CtxSchema } from '@/partykit/room/logic/game-rule'
import { PrimeDaifugoGameStateSchema } from '@/partykit/room/logic/game-rule/game-state'
import { z } from 'zod'
import { submitCardSetSchema } from './client-to-server'

const chatEventSchema = z.object({
  event: z.literal('chat'),
  message: z.string(),
  from: z.string(),
})
export type ChatEvent = z.infer<typeof chatEventSchema>

const presenceEventSchema = z.object({
  event: z.literal('presence'),
  presence: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['ready', 'not-ready']),
    }),
  ),
})
export type PresenceEvent = z.infer<typeof presenceEventSchema>

const roomStatusEventSchema = z.object({
  event: z.literal('room-status'),
  status: z.enum(['waiting', 'playing']),
})
export type RoomStatusEvent = z.infer<typeof roomStatusEventSchema>

const baseSystemEventSchema = z.object({
  event: z.literal('system'),
  gameState: PrimeDaifugoGameStateSchema,
  commander: z.object({
    id: z.string(),
    name: z.string(),
  }),
  ctx: CtxSchema,
})

const submissionResultSchema = z.object({
  submitCardSet: submitCardSetSchema,
  result: z
    .enum(['BASE_IS_NOT_PRIME', 'INVALID_FACT', 'FACT_CONTAIN_NOT_PRIME', 'INCORRECT_ANSWER'])
    .nullable(),
})
export type SubmissionResult = z.infer<typeof submissionResultSchema>

export const systemEventSchema = z.discriminatedUnion('action', [
  baseSystemEventSchema.extend({
    action: z.literal('game-start'),
  }),
  baseSystemEventSchema.extend({
    action: z.literal('draw'),
  }),
  baseSystemEventSchema.extend({
    action: z.literal('pass'),
  }),
  baseSystemEventSchema.extend({
    action: z.literal('submit'),
    submissionResult: submissionResultSchema,
  }),
])
export type SystemEvent = z.infer<typeof systemEventSchema>

export const serverToClientSchema = z.union([
  chatEventSchema,
  presenceEventSchema,
  roomStatusEventSchema,
  systemEventSchema,
])
