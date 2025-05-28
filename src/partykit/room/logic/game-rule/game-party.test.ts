import type { SubmitCardSet } from '@/interface/client-to-server'
import { describe, expect, it } from '@jest/globals'
import _ from 'lodash'
import { GameParty } from './game-party'
import { PrimeDaifugoGame } from './game-rule'
import { type Ctx, INVALID_MOVE, PLAYER_STATE } from './game-rule.pkg'
import { LAST_SUBMIT_ERROR, type PrimeDaifugoGameState } from './game-state'
const initialFixedState: PrimeDaifugoGameState = {
  players: {
    0: { hand: ['JS', '4C', '2D', '6C', '8H', '9D', 'KD', '3H', '2C'], drawRight: true },
    1: { hand: ['3D', 'JC', 'KC', '8D', '10H', '2S', '7S', '10D', '5D'], drawRight: true },
  },
  field: [],
  deck: [
    '3S',
    '5D',
    '6S',
    'JH',
    'AH',
    'KS',
    '8S',
    '9C',
    '4D',
    'KH',
    'QC',
    '2H',
    '10C',
    '7H',
    '9S',
    'AD',
    '3C',
    'QH',
    'AS',
    '5H',
    '9H',
    'QS',
    '4S',
    'JD',
    '10S',
    '2C',
    '6H',
    '5S',
    '4H',
    '7D',
    '6D',
    'AC',
    '5C',
    '8C',
    '7C',
    'QD',
  ],
  deckTopPlayer: null,
  lastSubmitError: null,
  rule: {
    initNumCards: 11,
    maxSubmitNumCards: 4,
  },
}
const initialFixedCtx: Ctx = {
  numPlayers: 2,
  activePlayers: { 0: PLAYER_STATE.PLAY, 1: PLAYER_STATE.PLAY },
  currentPlayer: '0',
  playOrder: ['0', '1'],
}

describe('GameParty', () => {
  describe('constructor', () => {
    it('正しい初期状態でインスタンスが生成されること', () => {
      const client1Id = '0'
      const client2Id = '1'
      const party = new GameParty({
        game: PrimeDaifugoGame,
        players: [
          { id: '0', state: PLAYER_STATE.PLAY },
          { id: '1', state: PLAYER_STATE.PLAY },
        ],
      })

      const state = party.getState()

      expect(state.players[client1Id].hand).toHaveLength(11)
      expect(state.players[client2Id].hand).toHaveLength(11)
      expect(state.field).toHaveLength(0)
      expect(state.deck).toBeDefined()

      expect(party.ctx.numPlayers).toBe(2)
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(party.ctx.playOrder).toEqual([client1Id, client2Id])
      expect(party.ctx.activePlayers).toEqual({
        [client1Id]: 'play',
        [client2Id]: 'play',
      })

      expect(state.players[client1Id].hand).toHaveLength(11)
      expect(state.players[client1Id].drawRight).toBe(true)
      expect(state.players[client2Id].hand).toHaveLength(11)
      expect(state.players[client2Id].drawRight).toBe(true)
      expect(state.field).toHaveLength(0)
      expect(state.deck.length).toBe(52 - 11 * 2)
    })

    it('state を import してインスタンスが生成されること', () => {
      const client1Id = '0'
      const client2Id = '1'

      // state を生成
      const party = new GameParty({
        game: PrimeDaifugoGame,
        players: [
          { id: client1Id, state: PLAYER_STATE.PLAY },
          { id: client2Id, state: PLAYER_STATE.PLAY },
        ],
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
        players: [
          { id: client1Id, state: PLAYER_STATE.PLAY },
          { id: client2Id, state: PLAYER_STATE.PLAY },
        ],
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
        players: [
          { id: client1Id, state: PLAYER_STATE.PLAY },
          { id: client2Id, state: PLAYER_STATE.PLAY },
        ],
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
    it('シナリオ - 基本の submit', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })

      const [client1Id, client2Id] = party.ctx.playOrder

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
        client2: state.players[client2Id].hand.length,
      }
      const submitCard = '2D'
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 他のプレイヤーは出せない
      party.moves.submit(client2Id, ['3D'])
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 現在のプレイヤーが出せる
      party.moves.submit(client1Id, {
        submit: [submitCard],
        factor: [],
      }) // 素数を出す
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1 - 1)

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual([submitCard])

      expect(state.deckTopPlayer).toBe(client1Id)

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe(client2Id)

      // もう一人のプレイヤーが出せる
      expect(party.moves.submit(client2Id, { submit: ['AD'], factor: [] })).toBe(INVALID_MOVE) // 手札にないカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(
        party.moves.submit(client2Id, {
          submit: ['2S'],
          factor: [],
        }),
      ).toBe(INVALID_MOVE) // 場よりも小さいカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(party.moves.submit(client2Id, { submit: ['3D', 'JC'], factor: [] })).toBe(INVALID_MOVE) // 場とよりも多い枚数のカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(state.field[0]).toEqual([submitCard]) // field が変わらない
      expect(party.moves.submit(client2Id, { submit: ['8D'], factor: [] })).not.toBe(INVALID_MOVE) // 素数でないカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2 + 1) // 失敗して手札が増える

      expect(state.deckTopPlayer).toBeNull()
      expect(state.field).toHaveLength(0)
      expect(party.ctx.currentPlayer).toBe(client1Id)
    })

    it('シナリオ - 素因数分解の submit', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })

      const [client1Id, client2Id] = party.ctx.playOrder

      const state = party.getState()
      const initialDeckLength = state.deck.length
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
        client2: state.players[client2Id].hand.length,
      }
      const submitCardSet: SubmitCardSet = { submit: ['6C'], factor: ['2D', '*', '3H'] }
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 他のプレイヤーは出せない
      party.moves.submit(client2Id, { submit: ['8D'], factor: ['2S', '^', '3D'] })
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 現在のプレイヤーが出せる
      expect(party.moves.submit(client1Id, submitCardSet)).not.toBe(INVALID_MOVE) // 素数を出す
      expect(state.deck.length).toBe(initialDeckLength + 2) // 素因数分解で用いたカードがデッキに戻る
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1 - 3) // 出したカードが手札から消える

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual(submitCardSet.submit)

      expect(state.deckTopPlayer).toBe(client1Id)

      // active player が変わる
      expect(party.ctx.currentPlayer).toBe(client2Id)

      // もう一人のプレイヤーが出せる
      expect(party.moves.submit(client2Id, { submit: ['AD'], factor: [] })).toBe(INVALID_MOVE) // 手札にないカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(
        party.moves.submit(client2Id, {
          submit: ['2S'],
          factor: [],
        }),
      ).toBe(INVALID_MOVE) // 場よりも小さいカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(party.moves.submit(client2Id, { submit: ['3D', 'JC'], factor: [] })).toBe(INVALID_MOVE) // 場とよりも多い枚数のカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2) // 手札が変わらない

      expect(state.field[0]).toEqual(submitCardSet.submit) // field が変わらない
      expect(party.moves.submit(client2Id, { submit: ['8D'], factor: [] })).not.toBe(INVALID_MOVE) // 素数でないカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2 + 1) // 失敗して手札が増える

      expect(state.deckTopPlayer).toBeNull()
      expect(state.field).toHaveLength(0)
      expect(party.ctx.currentPlayer).toBe(client1Id)
    })

    it('57になる数は出すことができる', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })
      const [client1Id, client2Id] = party.ctx.playOrder
      const initialState = party.getState()
      const initialDeckLength = initialState.deck.length
      const initialHandLength = {
        client1: initialState.players[client1Id].hand.length,
        client2: initialState.players[client2Id].hand.length,
      }
      const submitCardSet: SubmitCardSet = { submit: ['5D', '7S'], factor: [] }

      party.ctx.currentPlayer = client2Id
      party.moves.submit(client2Id, submitCardSet) // 57
      const state = party.getState()

      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2 - 2) // 出したカードが手札から消える
      expect(state.deck.length).toBe(initialDeckLength + 2) // 57 で出した枚数だけ増える
      expect(state.field).toHaveLength(0) // 場は流れる
      expect(state.deckTopPlayer).toBeNull() // デッキトップは null
      expect(party.ctx.currentPlayer).toBe(client2Id) // active player は変わらない
    })

    it('素因数分解失敗<計算誤り>した場合, 提出した枚数と構成カードの枚数がペナルティで増える', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })
      const [client1Id] = party.ctx.playOrder
      const initialState = _.cloneDeep(party.getState())

      // 素因数分解失敗
      party.moves.submit(client1Id, {
        submit: ['8H'],
        factor: ['2D', '*', '3H'],
      })
      const state = party.getState()

      expect(state.lastSubmitError).toBe(LAST_SUBMIT_ERROR.INCORRECT_ANSWER)
      expect(state.players[client1Id].hand.length).toBe(
        initialState.players[client1Id].hand.length + 3, // 提出した枚数 + 構成カードの枚数
      )
    })

    it('素因数分解失敗<因数が素数でない>場合, 提出した枚数と構成カードの枚数がペナルティで増える', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })
      const [client1Id] = party.ctx.playOrder
      const initialState = _.cloneDeep(party.getState())

      // 素因数分解失敗
      party.moves.submit(client1Id, {
        submit: ['8H'],
        factor: ['2D', '*', '4C'],
      })
      const state = party.getState()

      expect(state.lastSubmitError).toBe(LAST_SUBMIT_ERROR.FACT_CONTAIN_NOT_PRIME)
      expect(state.players[client1Id].hand.length).toBe(
        initialState.players[client1Id].hand.length + 3, // 提出した枚数 + 構成カードの枚数
      )
    })

    it('所持していないカードを出そうとした場合, INVALID_MOVE になる', () => {
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep(initialFixedState),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })
      const [client1Id] = party.ctx.playOrder

      const state = party.getState()
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
      }
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 所持していないカードを出そうとする
      expect(
        party.moves.submit(client1Id, {
          submit: ['7H'],
          factor: [],
        }),
      ).toBe(INVALID_MOVE)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1) // 手札が変わらない
      expect(party.ctx.currentPlayer).toBe(client1Id) // active player が変わらない
    })

    it('rule.maxSubmitNumCards を超える枚数のカードを出そうとした場合, INVALID_MOVE になる', () => {
      const MAX_SUBMIT_NUM_CARDS = 4
      const party = new GameParty<typeof PrimeDaifugoGame>({
        game: PrimeDaifugoGame,
        state: _.cloneDeep({
          ...initialFixedState,
          rule: {
            ...initialFixedState.rule,
            maxSubmitNumCards: MAX_SUBMIT_NUM_CARDS,
          },
        }),
        activePlayers: initialFixedCtx.activePlayers,
        currentPlayer: initialFixedCtx.currentPlayer,
        playOrder: initialFixedCtx.playOrder,
      })
      const [client1Id] = party.ctx.playOrder

      const state = party.getState()
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
      }
      expect(party.ctx.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // rule.maxSubmitNumCards を超える枚数のカードを出そうとする
      expect(
        party.moves.submit(client1Id, {
          submit: ['2D', '6C', '8H', '9D', 'KD'],
          factor: [],
        }),
      ).toBe(INVALID_MOVE)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1) // 手札が変わらない
      expect(party.ctx.currentPlayer).toBe(client1Id) // active player が変わらない
    })
  })
})
