/**
 * GameRule の抽象化レイヤー
 */

import { z } from 'zod'
export const INVALID_MOVE = 'INVALID_MOVE'
export enum PLAYER_STATE {
  OBSERVE = 'observe',
  PLAY = 'play',
}
export const CtxSchema = z.object({
  numPlayers: z.number(),
  activePlayers: z.record(z.string(), z.enum([PLAYER_STATE.OBSERVE, PLAYER_STATE.PLAY])),
  currentPlayer: z.string(),
  playOrder: z.array(z.string()),
})

export type Ctx = z.infer<typeof CtxSchema>

export interface Game<State = any, SetupData = any> {
  name?: string
  minPlayers?: number
  maxPlayers?: number
  moves: Record<string, MoveFn<State>>
  events?: {
    endTurn?: boolean
  }
  setup: (ctx: Ctx, setupData?: SetupData) => State
  endIf: (ctx: Readonly<Ctx>, state: Readonly<State>) => boolean
}

export type MoveEvents = {
  endTurn: (args?: { next?: string }) => void
}
export type MoveFnArgs<S> = { ctx: Ctx; state: S; events: MoveEvents }
export type MoveFn<S> = (args: MoveFnArgs<S>, ...input: any[]) => S | typeof INVALID_MOVE
