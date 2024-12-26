import { type CardId, cardIds } from '@/game-card/src'
import _ from 'lodash'
import type { PrimeDaifugoGameState } from './game-state'

export const INVALID_MOVE = 'INVALID_MOVE'
export type PlayerStage = 'observe' | 'wait' | 'play' | 'end'

export interface Ctx {
  numPlayers: number
  activePlayers: {
    [playerID: string]: PlayerStage
  }
  currentPlayer: string | null
  playOrder: string[]
}

export interface Game<S = unknown> {
  name?: string
  minPlayers?: number
  maxPlayers?: number
  moves?: MoveMap<S>
  events?: {
    endGame?: boolean
    endPhase?: boolean
    endTurn?: boolean
    setPhase?: boolean
    endStage?: boolean
    setStage?: boolean
    pass?: boolean
    setActivePlayers?: boolean
  }
  setup: (ctx: Ctx) => S
}

export type MoveEvents = {
  endTurn: (args?: { next?: string }) => void
}
export type MoveFnArgs<S = unknown> = { ctx: Ctx; state: S; events: MoveEvents }
export type MoveFn<S = unknown> = (
  args: MoveFnArgs<S>,
  ...input: unknown[]
) => S | typeof INVALID_MOVE
export interface MoveMap<S = unknown> {
  [moveName: string]: MoveFn<S>
}

const config = {
  initialNumCards: 8,
} as const

export const PrimeDaifugoGame = {
  name: 'prime-daifugo',
  minPlayers: 2,
  maxPlayers: 4,
  setup: function (ctx) {
    const deck = _.shuffle([...cardIds])

    if (
      ctx.numPlayers > (this.maxPlayers ?? Number.POSITIVE_INFINITY) ||
      ctx.numPlayers < (this.minPlayers ?? 0)
    ) {
      throw new Error('Invalid number of players')
    }
    if (deck.length < config.initialNumCards * ctx.numPlayers) {
      throw new Error('Not enough cards for all players')
    }

    const players: PrimeDaifugoGameState['players'] = {}
    for (const playerID of Object.keys(ctx.activePlayers)) {
      players[playerID] = {
        hand: deck.splice(0, config.initialNumCards),
        drawRight: true,
      }
    }

    return {
      playersStage: {},
      players,
      field: [],
      deck: deck,
    }
  },
  moves: {
    draw: ({ ctx, state }) => {
      const player = state.players[ctx.currentPlayer]
      if (state.deck.length === 0) {
        return INVALID_MOVE
      }
      if (player.drawRight === false) {
        return INVALID_MOVE
      }
      const drawnCard = state.deck.pop()
      player.hand.push(drawnCard)
      player.drawRight = false

      return state
    },

    pass: ({ ctx, state, events }) => {
      const player = state.players[ctx.currentPlayer]
      player.drawRight = true
      events.endTurn()
      return state
    },

    submit: ({ ctx, state, events }, submitCardIds: CardId[]) => {
      const player = state.players[ctx.currentPlayer]

      // 出すカードがない
      if (submitCardIds.length === 0) {
        return INVALID_MOVE
      }
      // 手札にないカードを出そうとしている
      if (submitCardIds.some((submitCardId) => !player.hand.includes(submitCardId))) {
        return INVALID_MOVE
      }

      // カードを出す
      state.field.push(submitCardIds) // 場に出す
      _.pullAll(player.hand, submitCardIds) // 手札から削除

      events.endTurn()
      return state
    },
  },
} as const satisfies Game<PrimeDaifugoGameState>
