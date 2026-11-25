/**
 * Engine cases ported from the PartyKit rules (spec §7.4, RQ-R21):
 *   src/partykit/room/logic/game-rule/game-rule.test.ts   5 its
 *   src/partykit/room/logic/game-rule/game-party.test.ts 10 its
 *   ------------------------------------------------------------
 *   total                                                15 its, all ported
 *
 * Intentional differences (each marked `// CHANGED: <reason>` at the case):
 *   - observers are no longer seated: `setup` takes the seat list (2..4) and builds
 *     `playOrder` from it; there is no `activePlayers`/`numPlayers` ctx any more;
 *   - player-count and deck-size failures return `{ ok: false, reason }` instead of throwing;
 *   - the turn owner, order and turn counter live in `GameCore` (no separate `ctx`);
 *   - a rejected move returns `{ ok: false, reason }` (`not-your-turn`, `invalid-move`, …) and no
 *     new core, instead of `undefined`/`INVALID_MOVE` with an in-place state;
 *   - `submit` takes `{ submit, factor }`; the old test passed a bare array as a `SubmitCardSet`
 *     (rules §8.17 hygiene);
 *   - the old comment "各プレイヤーが8枚" at `game-rule.test.ts:21` is corrected to 11 (§8.17);
 *   - penalties draw from the END of the deck (RQ-R15; the old code drew from the front);
 *   - `leftTime` is gone from the state.
 * The fixed fixture below is kept verbatim from `game-party.test.ts`, including its two duplicate
 * cards (`2C`, `5D` appear in a hand and in the deck); none of the ported assertions depend on it.
 */
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../shared/rng'
import type { CardId } from './cards'
import { engine } from './engine'
import type { GameCore, Move, PrimeDaifugoSetupData } from './types'

const DEFAULT_RULE: PrimeDaifugoSetupData = {
  initNumCards: 11,
  maxSubmitNumCards: 4,
  halfEvenNumbers: false,
  timeLimit: 60,
}

const rng = () => mulberry32(2024)

const initialFixedCore = (): GameCore => ({
  rule: { initNumCards: 11, maxSubmitNumCards: 4, halfEvenNumbers: false, timeLimit: 60 },
  playOrder: ['0', '1'],
  currentPlayer: '0',
  turn: 0,
  players: {
    0: { hand: ['JS', '4C', '2D', '6C', '8H', '9D', 'KD', '3H', '2C'], drawRight: true },
    1: { hand: ['3D', 'JC', 'KC', '8D', '10H', '2S', '7S', '10D', '5D'], drawRight: true },
  },
  field: [],
  // biome-ignore format: keep the pinned fixture compact
  deck: [
    '3S', '5D', '6S', 'JH', 'AH', 'KS', '8S', '9C', '4D', 'KH', 'QC', '2H', '10C', '7H', '9S', 'AD',
    '3C', 'QH', 'AS', '5H', '9H', 'QS', '4S', 'JD', '10S', '2C', '6H', '5S', '4H', '7D', '6D', 'AC',
    '5C', '8C', '7C', 'QD',
  ],
  deckTopPlayer: null,
  lastResult: null,
  winner: null,
})

const submit = (
  cards: CardId[],
  factor: Extract<Move, { type: 'submit' }>['factor'] = [],
): Move => ({
  type: 'submit',
  submit: cards,
  factor,
})

/** Applies a move that must be accepted and returns the new core. */
const play = (core: GameCore, by: string, move: Move): GameCore => {
  const result = engine.applyMove(core, by, move, rng())
  if (!result.ok) {
    throw new Error(`rejected: ${result.reason}`)
  }
  return result.core
}

const setupCore = (seats: string[], rule: Partial<PrimeDaifugoSetupData> = {}): GameCore => {
  const result = engine.setup(seats, { ...DEFAULT_RULE, ...rule }, rng())
  if (!result.ok) {
    throw new Error(`setup failed: ${result.reason}`)
  }
  return result.core
}

describe('ported: game-rule.test.ts (PrimeDaifugoGame.setup)', () => {
  it('各プレイヤーにデフォルトの枚数のカードが配られること', () => {
    const core = setupCore(['0', '1'])

    // CHANGED: the old comment said 8 cards while asserting 11 (rules §8.17); each player has 11
    expect(core.players['0'].hand).toHaveLength(11)
    expect(core.players['1'].hand).toHaveLength(11)
    expect(core.field).toHaveLength(0)
    expect(core.deck).toBeDefined()
  })

  it('初期手札枚数を指定してゲームを開始できること', () => {
    // CHANGED: 5 is not an allowed initNumCards value (RQ-R22 is enforced by the session); the
    // engine still deals whatever the stored rule says, so the pinned value 5 is kept
    const core = setupCore(['0', '1'], { initNumCards: 5 })

    expect(core.players['0'].hand).toHaveLength(5)
    expect(core.players['1'].hand).toHaveLength(5)
    expect(core.field).toHaveLength(0)
    expect(core.deck).toBeDefined()
  })

  it('プレイヤー数が多すぎる場合はエラーを投げること', () => {
    // CHANGED: returns { ok: false, reason } instead of throwing
    expect(engine.setup(['0', '1', '2', '3', '4'], DEFAULT_RULE, rng())).toEqual({
      ok: false,
      reason: 'bad-player-count',
    })
  })

  it('プレイヤー数が少なすぎる場合はエラーを投げること', () => {
    // CHANGED: returns { ok: false, reason } instead of throwing
    expect(engine.setup(['0'], DEFAULT_RULE, rng())).toEqual({
      ok: false,
      reason: 'bad-player-count',
    })
  })

  it('偶数半減ルールが有効な場合、ハートとダイヤの偶数カードが除外されること', () => {
    const core = setupCore(['0', '1'], { halfEvenNumbers: true })
    const allCards = [...core.players['0'].hand, ...core.players['1'].hand, ...core.deck]
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
    expect(allCards.some((cardId) => exceptCardIds.includes(cardId))).toBe(false)
  })
})

describe('ported: game-party.test.ts (GameParty)', () => {
  describe('constructor', () => {
    it('正しい初期状態でインスタンスが生成されること', () => {
      const client1Id = '0'
      const client2Id = '1'
      // CHANGED: seats are passed directly (no `{ id, state: PLAY }` players / activePlayers)
      const core = setupCore([client1Id, client2Id])

      expect(core.players[client1Id].hand).toHaveLength(11)
      expect(core.players[client2Id].hand).toHaveLength(11)
      expect(core.field).toHaveLength(0)
      expect(core.deck).toBeDefined()

      // CHANGED: numPlayers/activePlayers are gone; the seats are playOrder
      expect(core.playOrder).toHaveLength(2)
      expect(core.currentPlayer).toBe(client1Id)
      expect(core.playOrder).toEqual([client1Id, client2Id])
      expect(Object.keys(core.players).sort()).toEqual([client1Id, client2Id])

      expect(core.players[client1Id].drawRight).toBe(true)
      expect(core.players[client2Id].drawRight).toBe(true)
      expect(core.deck.length).toBe(52 - 11 * 2)
    })

    it('state を import してインスタンスが生成されること', () => {
      const exported = setupCore(['0', '1'])
      // CHANGED: "import" is a JSON round trip of the plain GameCore (RQ-R20)
      const imported: GameCore = JSON.parse(JSON.stringify(exported))
      expect(imported).toEqual(exported)
      expect(engine.applyMove(imported, '0', { type: 'pass' }, rng())).toEqual(
        engine.applyMove(exported, '0', { type: 'pass' }, rng()),
      )
    })
  })

  describe('move.draw', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const client1Id = '0'
      const client2Id = '1'
      const core = setupCore([client1Id, client2Id])
      const initialDeckLength = core.deck.length
      const initialHandLength = core.players[client1Id].hand.length

      // 他のプレイヤーはドローできない
      // CHANGED: explicit rejection instead of a silent no-op
      expect(engine.applyMove(core, client2Id, { type: 'draw' }, rng())).toEqual({
        ok: false,
        reason: 'not-your-turn',
      })
      expect(core.deck.length).toBe(initialDeckLength)
      expect(core.players[client2Id].hand.length).toBe(initialHandLength)

      // 現在のプレイヤーがドローできる
      expect(core.players[client1Id].drawRight).toBe(true)
      const drew = play(core, client1Id, { type: 'draw' })
      expect(drew.deck.length).toBe(initialDeckLength - 1)
      expect(drew.players[client1Id].hand.length).toBe(initialHandLength + 1)

      // １ターンで複数回ドローできない
      expect(engine.applyMove(drew, client1Id, { type: 'draw' }, rng())).toEqual({
        ok: false,
        reason: 'already-drawn',
      })
      expect(drew.deck.length).toBe(initialDeckLength - 1)
      expect(drew.players[client1Id].hand.length).toBe(initialHandLength + 1)

      // そのプレイヤーの flag は false になっている
      expect(drew.players[client1Id].drawRight).toBe(false)

      // active player は変わらない
      expect(drew.currentPlayer).toBe(client1Id)
    })
  })

  describe('move.pass', () => {
    it('現在のプレイヤーのみがmoveを実行できること', () => {
      const client1Id = '0'
      const client2Id = '1'
      const core = setupCore([client1Id, client2Id])
      const initialDeckLength = core.deck.length
      const initialHandLength = core.players[client1Id].hand.length
      expect(core.currentPlayer).toBe(client1Id)

      // 他のプレイヤーはパスできない
      expect(engine.applyMove(core, client2Id, { type: 'pass' }, rng())).toEqual({
        ok: false,
        reason: 'not-your-turn',
      })
      expect(core.deck.length).toBe(initialDeckLength)
      expect(core.players[client2Id].hand.length).toBe(initialHandLength)

      // 現在のプレイヤーがパスできる
      expect(core.players[client1Id].drawRight).toBe(true)
      const passed = play(core, client1Id, { type: 'pass' })
      expect(passed.deck.length).toBe(initialDeckLength)
      expect(passed.players[client1Id].hand.length).toBe(initialHandLength)

      // そのプレイヤーの flag は true になっている
      expect(passed.players[client1Id].drawRight).toBe(true)

      // active player が変わる
      expect(passed.currentPlayer).toBe(client2Id)

      // 他のプレイヤーがパスできる
      const passed2 = play(passed, client2Id, { type: 'pass' })
      expect(passed2.deck.length).toBe(initialDeckLength)
      expect(passed2.players[client2Id].hand.length).toBe(initialHandLength)
      expect(passed2.currentPlayer).toBe(client1Id)
    })
  })

  describe('move.submit', () => {
    it('シナリオ - 基本の submit', () => {
      let state = initialFixedCore()
      const [client1Id, client2Id] = state.playOrder
      const initialDeckLength = state.deck.length
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
        client2: state.players[client2Id].hand.length,
      }
      const submitCard: CardId = '2D'
      expect(state.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 他のプレイヤーは出せない
      // CHANGED: the old test passed a bare array (`['3D']`) as a SubmitCardSet (rules §8.17)
      expect(engine.applyMove(state, client2Id, submit(['3D']), rng())).toEqual({
        ok: false,
        reason: 'not-your-turn',
      })
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 現在のプレイヤーが出せる（素数を出す）
      state = play(state, client1Id, submit([submitCard]))
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1 - 1)

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual([submitCard])
      expect(state.deckTopPlayer).toBe(client1Id)

      // active player が変わる
      expect(state.currentPlayer).toBe(client2Id)

      // もう一人のプレイヤーが出せる
      // CHANGED: rejections are { ok: false, reason: 'invalid-move' } instead of INVALID_MOVE
      // 手札にないカードを出す
      expect(engine.applyMove(state, client2Id, submit(['AD']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 場よりも小さいカードを出す
      expect(engine.applyMove(state, client2Id, submit(['2S']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 場とよりも多い枚数のカードを出す
      expect(engine.applyMove(state, client2Id, submit(['3D', 'JC']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      expect(state.field[0]).toEqual([submitCard]) // field が変わらない
      // 素数でないカードを出す
      state = play(state, client2Id, submit(['8D']))
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2 + 1) // 失敗して手札が増える

      expect(state.deckTopPlayer).toBeNull()
      expect(state.field).toHaveLength(0)
      expect(state.currentPlayer).toBe(client1Id)
    })

    it('シナリオ - 素因数分解の submit', () => {
      let state = initialFixedCore()
      const [client1Id, client2Id] = state.playOrder
      const initialDeckLength = state.deck.length
      const initialHandLength = {
        client1: state.players[client1Id].hand.length,
        client2: state.players[client2Id].hand.length,
      }
      const submitCardSet = { submit: ['6C'] as CardId[], factor: ['2D', '*', '3H'] as const }
      expect(state.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      // 他のプレイヤーは出せない
      expect(engine.applyMove(state, client2Id, submit(['8D'], ['2S', '^', '3D']), rng())).toEqual({
        ok: false,
        reason: 'not-your-turn',
      })
      expect(state.deck.length).toBe(initialDeckLength)
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      // 現在のプレイヤーが出せる
      state = play(state, client1Id, submit(submitCardSet.submit, [...submitCardSet.factor]))
      expect(state.deck.length).toBe(initialDeckLength + 2) // 素因数分解で用いたカードがデッキに戻る
      expect(state.players[client1Id].hand.length).toBe(initialHandLength.client1 - 3) // 出したカードが手札から消える

      // field に出したカードが追加されている
      expect(state.field).toHaveLength(1)
      expect(state.field[0]).toEqual(submitCardSet.submit)
      expect(state.deckTopPlayer).toBe(client1Id)

      // active player が変わる
      expect(state.currentPlayer).toBe(client2Id)

      // もう一人のプレイヤーが出せる
      // CHANGED: rejections are { ok: false, reason: 'invalid-move' } instead of INVALID_MOVE
      expect(engine.applyMove(state, client2Id, submit(['AD']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      expect(engine.applyMove(state, client2Id, submit(['2S']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      expect(engine.applyMove(state, client2Id, submit(['3D', 'JC']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2)

      expect(state.field[0]).toEqual(submitCardSet.submit) // field が変わらない
      state = play(state, client2Id, submit(['8D'])) // 素数でないカードを出す
      expect(state.players[client2Id].hand.length).toBe(initialHandLength.client2 + 1) // 失敗して手札が増える

      expect(state.deckTopPlayer).toBeNull()
      expect(state.field).toHaveLength(0)
      expect(state.currentPlayer).toBe(client1Id)
    })

    it('57になる数は出すことができる', () => {
      const initial = initialFixedCore()
      const [, client2Id] = initial.playOrder
      // CHANGED: the turn owner lives in the core (was `party.ctx.currentPlayer = client2Id`)
      initial.currentPlayer = client2Id
      const initialDeckLength = initial.deck.length
      const initialHandLength = initial.players[client2Id].hand.length

      const state = play(initial, client2Id, submit(['5D', '7S'])) // 57

      expect(state.players[client2Id].hand.length).toBe(initialHandLength - 2) // 出したカードが手札から消える
      expect(state.deck.length).toBe(initialDeckLength + 2) // 57 で出した枚数だけ増える
      expect(state.field).toHaveLength(0) // 場は流れる
      expect(state.deckTopPlayer).toBeNull() // デッキトップは null
      expect(state.currentPlayer).toBe(client2Id) // active player は変わらない
    })

    it('素因数分解失敗<計算誤り>した場合, 提出した枚数と構成カードの枚数がペナルティで増える', () => {
      const initial = initialFixedCore()
      const [client1Id] = initial.playOrder

      const result = engine.applyMove(initial, client1Id, submit(['8H'], ['2D', '*', '3H']), rng())
      if (!result.ok) {
        throw new Error('rejected')
      }

      expect(result.core.lastResult).toBe('INCORRECT_ANSWER')
      expect(result.core.players[client1Id].hand.length).toBe(
        initial.players[client1Id].hand.length + 3, // 提出した枚数 + 構成カードの枚数
      )
      // CHANGED: penalties come from the END of the deck (RQ-R15)
      expect(result.core.players[client1Id].hand.slice(-3)).toEqual(['QD', '7C', '8C'])
    })

    it('素因数分解失敗<因数が素数でない>場合, 提出した枚数と構成カードの枚数がペナルティで増える', () => {
      const initial = initialFixedCore()
      const [client1Id] = initial.playOrder

      const result = engine.applyMove(initial, client1Id, submit(['8H'], ['2D', '*', '4C']), rng())
      if (!result.ok) {
        throw new Error('rejected')
      }

      expect(result.core.lastResult).toBe('FACT_CONTAIN_NOT_PRIME')
      expect(result.core.players[client1Id].hand.length).toBe(
        initial.players[client1Id].hand.length + 3, // 提出した枚数 + 構成カードの枚数
      )
    })

    it('所持していないカードを出そうとした場合, INVALID_MOVE になる', () => {
      const state = initialFixedCore()
      const [client1Id] = state.playOrder
      const initialHandLength = state.players[client1Id].hand.length
      expect(state.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      expect(engine.applyMove(state, client1Id, submit(['7H']), rng())).toEqual({
        ok: false,
        reason: 'invalid-move',
      })
      expect(state.players[client1Id].hand.length).toBe(initialHandLength) // 手札が変わらない
      expect(state.currentPlayer).toBe(client1Id) // active player が変わらない
    })

    it('rule.maxSubmitNumCards を超える枚数のカードを出そうとした場合, INVALID_MOVE になる', () => {
      const MAX_SUBMIT_NUM_CARDS = 4
      const state = initialFixedCore()
      state.rule = { ...state.rule, maxSubmitNumCards: MAX_SUBMIT_NUM_CARDS }
      const [client1Id] = state.playOrder
      const initialHandLength = state.players[client1Id].hand.length
      expect(state.currentPlayer).toBe(client1Id)
      expect(state.field).toHaveLength(0)

      expect(
        engine.applyMove(state, client1Id, submit(['2D', '6C', '8H', '9D', 'KD']), rng()),
      ).toEqual({ ok: false, reason: 'invalid-move' })
      expect(state.players[client1Id].hand.length).toBe(initialHandLength) // 手札が変わらない
      expect(state.currentPlayer).toBe(client1Id) // active player が変わらない
    })
  })
})
