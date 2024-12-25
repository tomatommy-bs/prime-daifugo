import { GameParty } from './game-party'
import { PrimeDaifugoGame } from './game-rule'

describe('GameParty', () => {
  describe('constructor', () => {
    it('正しい初期状態でインスタンスが生成されること', () => {
      const party = new GameParty({
        game: PrimeDaifugoGame,
        numPlayers: 2,
      })

      const state = party.getState()

      expect(state.players['0'].hand).toHaveLength(8)
      expect(state.players['1'].hand).toHaveLength(8)
      expect(state.field).toHaveLength(0)
      expect(state.deck).toBeDefined()

      expect(party.ctx.numPlayers).toBe(2)
      expect(party.ctx.currentPlayer).toBe('0')
      expect(party.ctx.playOrder).toEqual(['0', '1'])
      expect(party.ctx.activePlayers).toEqual({
        '0': 'play',
        '1': 'play',
      })

      expect(state.players['0'].hand).toHaveLength(8)
      expect(state.players['0'].drawRight).toBe(true)
      expect(state.players['1'].hand).toHaveLength(8)
      expect(state.players['1'].drawRight).toBe(true)
      expect(state.field).toHaveLength(0)
      expect(state.deck.length).toBe(52 - 8 * 2)
    })
  })

  describe('move.draw', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const party = new GameParty({
        game: PrimeDaifugoGame,
        numPlayers: 2,
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players['0'].hand.length

      // 他のプレイヤー(1)はドローできない
      party.move.draw('1')
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['1'].hand.length).toBe(initialHandLength)

      // 現在のプレイヤー(0)がドローできる
      expect(party.getState().players['0'].drawRight).toBe(true)
      party.move.draw('0')
      expect(state.deck.length).toBe(initialDeckLength - 1)
      expect(state.players['0'].hand.length).toBe(initialHandLength + 1)

      // １ターンで複数回ドローできない
      party.move.draw('0')
      expect(state.deck.length).toBe(initialDeckLength - 1)
      expect(state.players['0'].hand.length).toBe(initialHandLength + 1)

      // そのプレイヤーの flag は false になっている
      expect(party.getState().players['0'].drawRight).toBe(false)

      // active player は変わらない
      expect(party.ctx.currentPlayer).toBe('0')
    })
  })

  describe('move.pass', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const party = new GameParty({
        game: PrimeDaifugoGame,
        numPlayers: 2,
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players['0'].hand.length
      expect(party.ctx.currentPlayer).toBe('0')

      // 他のプレイヤー(1)はパスできない
      party.move.pass('1')
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['1'].hand.length).toBe(initialHandLength)

      // 現在のプレイヤー(0)がパスできる
      expect(party.getState().players['0'].drawRight).toBe(true)
      party.move.pass('0')
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['0'].hand.length).toBe(initialHandLength)

      // そのプレイヤーの flag は true になっている
      expect(party.getState().players['0'].drawRight).toBe(true)

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe('1')

      // 他のプレイヤー(1)がパスできる
      party.move.pass('1')
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['1'].hand.length).toBe(initialHandLength)
      expect(party.ctx.currentPlayer).toBe('0')
    })
  })

  describe('move.submit', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const party = new GameParty({
        game: PrimeDaifugoGame,
        numPlayers: 2,
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players['0'].hand.length
      const topCard = state.players['0'].hand[0]
      expect(party.ctx.currentPlayer).toBe('0')
      expect(state.field).toHaveLength(0)

      // 他のプレイヤー(1)は出せない
      party.move.submit('1', [state.players['1'].hand[0]])
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['1'].hand.length).toBe(initialHandLength)

      // 現在のプレイヤー(0)が出せる
      party.move.submit('0', [state.players['0'].hand[0]])
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players['0'].hand.length).toBe(initialHandLength - 1)

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual([topCard])

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe('1')
    })
  })
})
