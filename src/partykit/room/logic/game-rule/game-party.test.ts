import { GameParty } from './game-party'
import { PrimeDaifugoGame } from './game-rule'

describe('GameParty', () => {
  describe('constructor', () => {
    it('正しい初期状態でインスタンスが生成されること', () => {
      const client1Id = '0'
      const client2Id = '1'
      const party = new GameParty({
        game: PrimeDaifugoGame,
        playerIds: ['0', '1'],
      })

      const state = party.getState()

      expect(state.players[client1Id].hand).toHaveLength(8)
      expect(state.players[client2Id].hand).toHaveLength(8)
      expect(state.field).toHaveLength(0)
      expect(state.deck).toBeDefined()

      expect(party.ctx.numPlayers).toBe(2)
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(party.ctx.playOrder).toEqual([client1Id, client2Id])
      expect(party.ctx.activePlayers).toEqual({
        [client1Id]: 'play',
        [client2Id]: 'play',
      })

      expect(state.players[client1Id].hand).toHaveLength(8)
      expect(state.players[client1Id].drawRight).toBe(true)
      expect(state.players[client2Id].hand).toHaveLength(8)
      expect(state.players[client2Id].drawRight).toBe(true)
      expect(state.field).toHaveLength(0)
      expect(state.deck.length).toBe(52 - 8 * 2)
    })

    it('state を import してインスタンスが生成されること', () => {
      const client1Id = '0'
      const client2Id = '1'

      // state を生成
      const party = new GameParty({
        game: PrimeDaifugoGame,
        playerIds: [client1Id, client2Id],
      })
      const exportedState = party.getState()
      const exportedCtx = party.ctx

      // state を import してインスタンスを生成
      const party2 = new GameParty({
        game: PrimeDaifugoGame,
        activePlayers: exportedCtx.activePlayers,
        currentPlayer: exportedCtx.currentPlayer,
        playOrder: exportedCtx.playOrder,
        state: exportedState,
      })
      const importedState = party2.getState()
      expect(importedState).toEqual(exportedState)
    })
  })

  describe('move.draw', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const client1Id = '0'
      const client2Id = '1'

      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        playerIds: [client1Id, client2Id],
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players[client1Id].hand.length

      // 他のプレイヤーはドローできない
      party.moves.draw(client2Id)
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength)

      // 現在のプレイヤーがドローできる
      expect(party.getState().players[client1Id].drawRight).toBe(true)
      party.moves.draw(client1Id)
      expect(state.deck.length).toBe(initialDeckLength - 1)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength + 1)

      // １ターンで複数回ドローできない
      party.moves.draw(client1Id)
      expect(state.deck.length).toBe(initialDeckLength - 1)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength + 1)

      // そのプレイヤーの flag は false になっている
      expect(party.getState().players[client1Id].drawRight).toBe(false)

      // active player は変わらない
      expect(party.ctx.currentPlayer).toBe(client1Id)
    })
  })

  describe('move.pass', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const client1Id = '0'
      const client2Id = '1'

      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        playerIds: [client1Id, client2Id],
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players[client1Id].hand.length
      expect(party.ctx.currentPlayer).toBe(client1Id)

      // 他のプレイヤーはパスできない
      party.moves.pass(client2Id)
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength)

      // 現在のプレイヤーがパスできる
      expect(party.getState().players[client1Id].drawRight).toBe(true)
      party.moves.pass(client1Id)
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength)

      // そのプレイヤーの flag は true になっている
      expect(party.getState().players[client1Id].drawRight).toBe(true)

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe(client2Id)

      // 他のプレイヤーがパスできる
      party.moves.pass(client2Id)
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength)
      expect(party.ctx.currentPlayer).toBe(client1Id)
    })
  })

  describe('move.submit', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const client1Id = '0'
      const client2Id = '1'

      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        playerIds: [client1Id, client2Id],
      })

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = state.players[client1Id].hand.length
      const topCard = state.players[client1Id].hand[0]
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 他のプレイヤーは出せない
      party.moves.submit(client2Id, [state.players[client2Id].hand[0]])
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength)

      // 現在のプレイヤーが出せる
      party.moves.submit(client1Id, [state.players[client1Id].hand[0]])
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength - 1)

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual([topCard])

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe(client2Id)
    })
  })
})
