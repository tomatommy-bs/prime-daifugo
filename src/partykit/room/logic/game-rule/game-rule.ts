import assert from 'assert'
import { GAME_CONFIG, WORLD_CONFIG } from '@/constants/config'
import { cardIds, getCardInteger, getCardSuit, isCardId } from '@/game-card/src'
import type { SubmitCardSet } from '@/interface/client-to-server'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import {
  concatCardNumbers,
  evalFactCardIds,
  extractCardIdsFromFactCardIds,
  isValidFactCardIds,
  isValidFactCardIdsStrict,
} from '@/utils/play-card'
import _ from 'lodash'
import pf from 'primes-and-factors'
import { type Game, INVALID_MOVE, PLAYER_STATE } from './game-rule.pkg'
import { LAST_SUBMIT_ERROR, type PrimeDaifugoGameState } from './game-state'

export const PrimeDaifugoGame: Game<PrimeDaifugoGameState, Partial<PrimeDaifugoSetupData>> = {
  name: 'prime-daifugo',
  minPlayers: 2,
  maxPlayers: 4,
  setup: function (ctx, setupData) {
    const deck = _.shuffle([...cardIds]).filter((cardId) => {
      if (setupData?.halfEvenNumbers === true) {
        if (getCardInteger(cardId) % 2 === 0 && ['H', 'D'].includes(getCardSuit(cardId))) {
          // ハートとダイヤの偶数は除外
          return false
        }
      }
      return true
    })

    const rule: PrimeDaifugoSetupData = {
      initNumCards: setupData?.initNumCards ?? GAME_CONFIG.initialNumCards,
      maxSubmitNumCards: setupData?.maxSubmitNumCards ?? GAME_CONFIG.maxSubmitNumCards,
      halfEvenNumbers: setupData?.halfEvenNumbers ?? GAME_CONFIG.halfEvenNumbers,
      timeLimit: setupData?.timeLimit ?? GAME_CONFIG.timeLimit,
    }

    if (
      ctx.numPlayers > (this.maxPlayers ?? Number.POSITIVE_INFINITY) ||
      ctx.numPlayers < (this.minPlayers ?? 0)
    ) {
      throw new Error('Invalid number of players')
    }
    if (deck.length < GAME_CONFIG.initialNumCards * ctx.numPlayers) {
      throw new Error('Not enough cards for all players')
    }

    const players: PrimeDaifugoGameState['players'] = {}
    const activePlyerIds = Object.keys(ctx.activePlayers).filter(
      (playerID) => ctx.activePlayers[playerID] === PLAYER_STATE.PLAY,
    )
    for (const playerID of _.shuffle(activePlyerIds)) {
      players[playerID] = {
        hand: deck.splice(0, rule.initNumCards),
        drawRight: true,
      }
    }

    return {
      players,
      field: [],
      deck: deck,
      deckTopPlayer: null,
      lastSubmitError: null,
      leftTime: 60,
      rule,
    }
  },
  endIf: (_ctx, state) => {
    return Object.keys(state.players)
      .map((playerID) => state.players[playerID])
      .some((player) => player.hand.length === 0)
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

    submit: ({ ctx, state, events }, submitCardSet: SubmitCardSet) => {
      const player = state.players[ctx.currentPlayer]
      const { submit: submitCards, factor: factorCards } = submitCardSet
      const isFactMode = factorCards.length > 0
      player.drawRight = true

      // 出すカードがない
      if (submitCards.length === 0) {
        return INVALID_MOVE
      }
      // ルールの上限を超える枚数を出そうとしている
      if (submitCards.length > state.rule.maxSubmitNumCards) {
        return INVALID_MOVE
      }

      // 手札にないカードを出そうとしている
      if (submitCards.some((submitCardId) => !player.hand.includes(submitCardId))) {
        return INVALID_MOVE
      }
      if (
        factorCards.filter(isCardId).some((factorCardId) => !player.hand.includes(factorCardId))
      ) {
        return INVALID_MOVE
      }

      // field の一番上のカード
      const topFieldCard = _.last(state.field) ?? null

      let submitResult: PrimeDaifugoGameState['lastSubmitError'] = null
      const submitCardNumber = concatCardNumbers(submitCards)

      // case: 場にカードがない場合
      if (topFieldCard === null) {
        if (!isFactMode) {
          // rule: 場にカードがない場合, 素数なら出せる
          if (
            pf.isPrime(submitCardNumber) ||
            submitCardNumber === WORLD_CONFIG.GROTHENDIECK_PRIME
          ) {
            null
            // rule: 場にカードがない場合, 素数でない場合, 出したカードと同じ枚数のカードを山から引く
          } else {
            submitResult = LAST_SUBMIT_ERROR.BASE_IS_NOT_PRIME
          }
          // 素因数分解モード
        } else {
          if (!isValidFactCardIds(factorCards)) {
            submitResult = LAST_SUBMIT_ERROR.INVALID_FACT
          } else if (!isValidFactCardIdsStrict(factorCards)) {
            submitResult = LAST_SUBMIT_ERROR.FACT_CONTAIN_NOT_PRIME
          }
          const evalFactResult = evalFactCardIds(factorCards)

          // rule: 素因数分解した結果は出したカードと等しくなければならない
          if (evalFactResult !== concatCardNumbers(submitCards)) {
            submitResult = LAST_SUBMIT_ERROR.INCORRECT_ANSWER
          }
        }
      } else {
        // rule: 場にあるカードと同じ枚数のカードしか出せない
        if (submitCards.length !== topFieldCard.length) {
          return INVALID_MOVE
        }
        // rule: 場のカードの合計値より大きい値を出すことができる
        if (submitCardNumber <= concatCardNumbers(topFieldCard)) {
          return INVALID_MOVE
        }

        if (!isFactMode) {
          if (
            pf.isPrime(submitCardNumber) ||
            submitCardNumber === WORLD_CONFIG.GROTHENDIECK_PRIME
          ) {
            null
          } else {
            submitResult = LAST_SUBMIT_ERROR.BASE_IS_NOT_PRIME
          }
        } else {
          if (!isValidFactCardIds(factorCards)) {
            submitResult = LAST_SUBMIT_ERROR.INVALID_FACT
          } else if (!isValidFactCardIdsStrict(factorCards)) {
            submitResult = LAST_SUBMIT_ERROR.FACT_CONTAIN_NOT_PRIME
          }
          const evalFactResult = evalFactCardIds(factorCards)

          // rule: 素因数分解した結果は出したカードと等しくなければならない
          if (evalFactResult !== concatCardNumbers(submitCards)) {
            submitResult = LAST_SUBMIT_ERROR.INCORRECT_ANSWER
          }
        }
      }

      switch (submitResult) {
        case null: {
          state.field.push(submitCards) // 場に出す
          _.pullAll(player.hand, submitCards) // 手札から削除
          _.pullAll(player.hand, factorCards) // 手札から削除
          state.deckTopPlayer = ctx.currentPlayer
          const newDeck = _.shuffle([...state.deck, ...extractCardIdsFromFactCardIds(factorCards)])
          state.deck = newDeck
          break
        }
        case LAST_SUBMIT_ERROR.BASE_IS_NOT_PRIME: {
          const drawnCards = state.deck.splice(0, submitCards.length)
          player.hand.push(...drawnCards)
          break
        }
        case LAST_SUBMIT_ERROR.FACT_CONTAIN_NOT_PRIME:
        case LAST_SUBMIT_ERROR.INCORRECT_ANSWER: {
          const shouldDrawCardQty = submitCards.length + factorCards.filter(isCardId).length
          const drawnCards = state.deck.splice(0, shouldDrawCardQty)
          player.hand.push(...drawnCards)
          break
        }
        case LAST_SUBMIT_ERROR.INVALID_FACT: {
          return INVALID_MOVE
        }
        default:
          throw new Error(submitResult satisfies never)
      }
      state.lastSubmitError = submitResult

      if (submitCardNumber === WORLD_CONFIG.GROTHENDIECK_PRIME) {
        events.endTurn({ next: ctx.currentPlayer })
      } else {
        events.endTurn()
      }

      if (ctx.currentPlayer === state.deckTopPlayer) {
        flowField(state)
        state.deckTopPlayer = null
      }

      return state
    },
  },
} as const

/**
 * いわゆる「流れ」の処理
 */
const flowField = (state: PrimeDaifugoGameState): void => {
  const fieldAllCards = _.flatten(state.field)
  const newDeck = _.shuffle([...fieldAllCards, ...state.deck])
  state.deck = newDeck
  state.field = []
}
