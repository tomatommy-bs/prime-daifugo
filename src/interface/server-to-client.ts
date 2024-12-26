import { CtxSchema } from '@/partykit/room/logic/game-rule'
import { PrimeDaifugoGameStateSchema } from '@/partykit/room/logic/game-rule/game-state'
import { z } from 'zod'

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

const systemEventSchema = z.object({
  event: z.literal('system'),
  action: z.enum(['game-start', 'draw', 'pass', 'submit']),
  gameState: PrimeDaifugoGameStateSchema,
  ctx: CtxSchema,
})
export type SystemEvent = z.infer<typeof systemEventSchema>

export const serverToClientSchema = z.union([
  chatEventSchema,
  presenceEventSchema,
  roomStatusEventSchema,
  systemEventSchema,
])
