import type { CardId } from '@/game-card/src'
import { describe, expect, it } from 'vitest'
import { PrimeDaifugoGame } from './game-rule'
import { type Ctx, PLAYER_STATE } from './game-rule.pkg'

describe('PrimeDaifugoGame', () => {
  describe('setup', () => {
    it('各プレイヤーにデフォルトの枚数のカードが配られること', () => {
      const ctx: Ctx = {
        numPlayers: 2,
        activePlayers: {
          '0': PLAYER_STATE.PLAY,
          '1': PLAYER_STATE.PLAY,
        },
        currentPlayer: '0',
        playOrder: ['0', '1'],
      }

      const initialState = PrimeDaifugoGame.setup(ctx)

      // 各プレイヤーが8枚のカードを持っていることを確認
      expect(initialState.players['0']?.hand).toHaveLength(11)
      expect(initialState.players['1']?.hand).toHaveLength(11)

      // フィールドが空であることを確認
      expect(initialState.field).toHaveLength(0)

      // デッキが残っていることを確認
      expect(initialState.deck).toBeDefined()
    })

    it('初期手札枚数を指定してゲームを開始できること', () => {
      const ctx: Ctx = {
        numPlayers: 2,
        activePlayers: {
          '0': PLAYER_STATE.PLAY,
          '1': PLAYER_STATE.PLAY,
        },
        currentPlayer: '0',
        playOrder: ['0', '1'],
      }
      const initialState = PrimeDaifugoGame.setup(ctx, {
        initNumCards: 5,
      })

      // 各プレイヤーが5枚のカードを持っていることを確認
      expect(initialState.players['0']?.hand).toHaveLength(5)
      expect(initialState.players['1']?.hand).toHaveLength(5)
      // フィールドが空であることを確認
      expect(initialState.field).toHaveLength(0)
      // デッキが残っていることを確認
      expect(initialState.deck).toBeDefined()
    })

    it('プレイヤー数が多すぎる場合はエラーを投げること', () => {
      const ctx: Ctx = {
        numPlayers: 5,
        activePlayers: {
          '0': PLAYER_STATE.PLAY,
          '1': PLAYER_STATE.PLAY,
          '2': PLAYER_STATE.PLAY,
          '3': PLAYER_STATE.PLAY,
          '4': PLAYER_STATE.PLAY,
        },
        currentPlayer: '0',
        playOrder: ['0', '1', '2', '3', '4'],
      }

      expect(() => PrimeDaifugoGame.setup(ctx)).toThrow()
    })

    it('プレイヤー数が少なすぎる場合はエラーを投げること', () => {
      const ctx: Ctx = {
        numPlayers: 1,
        activePlayers: {
          '0': PLAYER_STATE.PLAY,
        },
        currentPlayer: '0',
        playOrder: ['0'],
      }

      expect(() => PrimeDaifugoGame.setup(ctx)).toThrow()
    })

    it('偶数半減ルールが有効な場合、ハートとダイヤの偶数カードが除外されること', () => {
      const ctx: Ctx = {
        numPlayers: 2,
        activePlayers: {
          '0': PLAYER_STATE.PLAY,
          '1': PLAYER_STATE.PLAY,
        },
        currentPlayer: '0',
        playOrder: ['0', '1'],
      }

      const initialState = PrimeDaifugoGame.setup(ctx, {
        halfEvenNumbers: true,
      })
      const hand0 = initialState.players['0']?.hand || []
      const hand1 = initialState.players['1']?.hand || []
      const allCards = [...hand0, ...hand1, ...initialState.deck]
      expect(
        allCards.some((cardId) => {
          const exceptCardIds: CardId[] = [
            '2H',
            '2D',
            '4H',
            '4D',
            '6H',
            '6D',
            '8H',
            '8D',
            '10H',
            '10D',
            'QH',
            'QD',
          ]
          return exceptCardIds.includes(cardId)
        }),
      ).toBe(false)
    })
  })
})
