import assert from 'assert'
import { type CardId, cardIds } from '@/game-card/src'
import { concatCardNumbers } from '@/utils/play-card'
import _ from 'lodash'
import { z } from 'zod'
import type { PrimeDaifugoGameState } from './game-state'

export const INVALID_MOVE = 'INVALID_MOVE'
export type PlayerStage = 'observe' | 'wait' | 'play' | 'end'

export const CtxSchema = z.object({
  numPlayers: z.number(),
  activePlayers: z.record(z.string(), z.enum(['observe', 'wait', 'play', 'end'])),
  currentPlayer: z.string(),
  playOrder: z.array(z.string()),
})

export type Ctx = z.infer<typeof CtxSchema>

export interface Game<State = any> {
  name?: string
  minPlayers?: number
  maxPlayers?: number
  moves: Record<string, MoveFn<State>>
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
  setup: (ctx: Ctx) => State
}

export type MoveEvents = {
  endTurn: (args?: { next?: string }) => void
}
export type MoveFnArgs<S> = { ctx: Ctx; state: S; events: MoveEvents }
export type MoveFn<S> = (args: MoveFnArgs<S>, ...input: any[]) => S | typeof INVALID_MOVE

const config = {
  initialNumCards: 8,
} as const

export const PrimeDaifugoGame: Game<PrimeDaifugoGameState> = {
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
      players,
      field: [],
      deck: deck,
      deckTopPlayer: null,
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
      assert(drawnCard)
      player.hand.push(drawnCard)
      player.drawRight = false

      return state
    },

    pass: ({ ctx, state, events }) => {
      const player = state.players[ctx.currentPlayer]
      player.drawRight = true

      events.endTurn()
      if (ctx.currentPlayer === state.deckTopPlayer) {
        flowField(state)
        state.deckTopPlayer = null
      }

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

      // field の一番上のカード
      const topFieldCard = _.last(state.field) ?? null

      const result: { isPrime: boolean | null } = {
        isPrime: null,
      }
      // case: 場にカードがない場合
      if (topFieldCard === null) {
        if (isPrime(concatCardNumbers(submitCardIds))) {
          result.isPrime = true
        } else {
          result.isPrime = false
        }
      } else {
        // rule: 場にあるカードと同じ枚数のカードしか出せない
        if (submitCardIds.length !== topFieldCard.length) {
          return INVALID_MOVE
        }
        // rule: 場のカードの合計値より大きい値を出すことができる
        if (concatCardNumbers(submitCardIds) <= concatCardNumbers(topFieldCard)) {
          return INVALID_MOVE
        }

        if (isPrime(concatCardNumbers(submitCardIds))) {
          result.isPrime = true
        } else {
          result.isPrime = false
        }
      }

      switch (result.isPrime) {
        case true: // rule: 素数なら出せる
          {
            state.field.push(submitCardIds) // 場に出す
            _.pullAll(player.hand, submitCardIds) // 手札から削除
            state.deckTopPlayer = ctx.currentPlayer
          }
          break
        case false: // rule: 素数でない場合, 出したカードと同じ枚数のカードを山から引く
          {
            const drawnCards = state.deck.splice(0, submitCardIds.length)
            player.hand.push(...drawnCards)
          }
          break
        default:
          return INVALID_MOVE
      }

      events.endTurn()
      if (ctx.currentPlayer === state.deckTopPlayer) {
        flowField(state)
        state.deckTopPlayer = null
      }

      return state
    },
  },
}

const isPrime = (n: number): boolean => {
  if (n === 1) {
    return false
  }
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      return false
    }
  }
  return true
}

/**
 * いわゆる「流れ」の処理
 */
const flowField = (state: PrimeDaifugoGameState): void => {
  const fieldAllCards = _.flatten(state.field)
  const newDeck = _.shuffle([...fieldAllCards, ...state.deck])
  state.deck = newDeck
  state.field = []
}
