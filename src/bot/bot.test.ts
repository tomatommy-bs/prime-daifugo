import { describe, expect, it } from 'vitest'
import { FULL_DECK } from '../game/cards'
import { engine } from '../game/engine'
import { isPrime } from '../game/numbers'
import type { CardId, GameCore } from '../game/types'
import { mulberry32 } from '../shared/rng'
import { DEFAULT_RULE } from '../shared/rule-options'
import { bestExpression, compositePlays, primePlays, toCards } from './moves'
import { BOT_LEVELS, type BotLevel, decideBotAction, determinize } from './policy'
import { isPrimeNumber, rankCounts, rankTables, spellings, strength } from './ranks'

const setup = (seed: number, seats = ['a', 'b', 'c']) => {
  const r = engine.setup(seats, DEFAULT_RULE, mulberry32(seed))
  if (!r.ok) {
    throw new Error('setup')
  }
  return r.core
}

describe('rank tables', () => {
  it('agrees with the engine on primality', () => {
    for (let n = 0; n < 20000; n += 1) {
      expect(isPrimeNumber(n)).toBe(isPrime(BigInt(n)))
    }
    for (const n of [13131313, 11111111, 99999989, 12131211]) {
      expect(isPrimeNumber(n)).toBe(isPrime(BigInt(n)))
    }
  })

  it('lists playable spellings, 57 included', () => {
    const { playable } = rankTables()
    expect(playable[1].map((s) => s.value)).toEqual([2, 3, 5, 7, 11, 13])
    expect(playable[2].some((s) => s.value === 57)).toBe(true)
    expect(spellings(113)).toEqual([
      [1, 1, 3],
      [1, 13],
      [11, 3],
    ])
    expect(strength(2, 1)).toBe(0)
    expect(strength(13, 1)).toBeCloseTo(5 / 6)
  })
})

describe('moves', () => {
  const hand: CardId[] = ['2S', '3S', '4S', 'KH', 'AD', '6C']

  it('lists prime plays above the field with the field size', () => {
    const plays = primePlays({ hand, top: ['7S'], maxSubmitNumCards: 4 })
    expect(plays.map((p) => p.value)).toEqual([13])
    const pairs = primePlays({ hand, top: ['AH', '7H'], maxSubmitNumCards: 4 })
    // two cards: 2·3 → 23, A·K → 113, K·A → 131, …
    expect(pairs.map((p) => p.value)).toEqual(expect.arrayContaining([23, 113, 131]))
    expect(pairs.every((p) => p.ranks.length === 2 && p.value > 17)).toBe(true)
  })

  it('beats nothing longer than four cards', () => {
    expect(
      primePlays({ hand, top: ['AS', 'AH', 'AC', 'AD', '3H'], maxSubmitNumCards: 52 }),
    ).toEqual([])
  })

  it('builds the expression that uses the most cards', () => {
    const cards = (tokens: unknown[] | null) => tokens?.filter((t) => typeof t === 'number').length
    // 12 = 2^2 · 3 or 2 · 2 · 3: both need two 2s and a 3
    expect(cards(bestExpression(rankCounts(['2S', '2H', '3S']), 12))).toBe(3)
    expect(bestExpression(rankCounts(['2S', '3S']), 12)).toBeNull()
    // 8 as three cards (2 · 2 · 2 or 2^2 · 2) beats 2^3 (two cards)
    expect(cards(bestExpression(rankCounts(['2S', '2H', '2C', '3S']), 8))).toBe(3)
    expect(bestExpression(rankCounts(['2S', '3S']), 8)).toEqual([2, '^', 3])
  })

  it('every generated play is accepted by the engine', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const core = setup(seed)
      const by = core.currentPlayer
      const ctx = { hand: core.players[by].hand, top: null, maxSubmitNumCards: 4 }
      const plays = [...primePlays(ctx), ...compositePlays(ctx)]
      for (const play of plays.slice(0, 60)) {
        const cards = toCards(ctx.hand, play)
        const r = engine.applyMove(core, by, { type: 'submit', ...cards }, mulberry32(seed))
        expect(r.ok).toBe(true)
        if (r.ok && r.outcome.kind === 'submitted') {
          expect(r.outcome.result).toBeNull()
          expect(r.core.players[by].hand.length).toBe(ctx.hand.length - play.shed)
        }
      }
    }
  })
})

describe('determinize', () => {
  it('keeps the own hand, hand sizes and the card total', () => {
    const core = setup(3)
    const world = determinize(core, 'a', mulberry32(9))
    expect(world.players.a.hand).toEqual(core.players.a.hand)
    for (const p of ['b', 'c']) {
      expect(world.players[p].hand).toHaveLength(core.players[p].hand.length)
    }
    const all = [...world.deck, ...Object.values(world.players).flatMap((p) => p.hand)]
    expect(new Set(all).size).toBe(FULL_DECK.length)
  })
})

/** Play a whole game with bots in every seat; every action must be legal. */
function playGame(levels: Record<string, BotLevel>, seed: number, maxMoves = 600) {
  const rng = mulberry32(seed)
  let core: GameCore = setup(seed, Object.keys(levels))
  let moves = 0
  while (core.winner === null && moves < maxMoves) {
    const by = core.currentPlayer
    const action = decideBotAction(core, by, levels[by], rng)
    const r = engine.applyMove(core, by, action, rng)
    expect(r.ok, JSON.stringify(action)).toBe(true)
    if (!r.ok) {
      break
    }
    core = r.core
    moves += 1
  }
  return core
}

describe('decideBotAction', () => {
  it.each(BOT_LEVELS)('%s plays only legal moves through whole games', (level) => {
    for (let seed = 1; seed <= (level === 'strong' ? 2 : 10); seed += 1) {
      playGame({ a: level, b: level, c: 'normal' }, seed)
    }
  })

  it('normal finishes a hand of a single prime at once', () => {
    const core = setup(5, ['a', 'b'])
    const custom: GameCore = {
      ...core,
      players: { ...core.players, a: { hand: ['7S'], drawRight: true } },
      currentPlayer: 'a',
      field: [],
    }
    expect(decideBotAction(custom, 'a', 'normal', mulberry32(1))).toEqual({
      type: 'submit',
      submit: ['7S'],
      factor: [],
    })
  })

  it('draws when nothing can be played, then passes', () => {
    const core = setup(5, ['a', 'b'])
    const stuck: GameCore = {
      ...core,
      players: { ...core.players, a: { hand: ['4S', '6S', '8S'], drawRight: true } },
      currentPlayer: 'a',
      field: [['KS']],
    }
    for (const level of BOT_LEVELS) {
      expect(decideBotAction(stuck, 'a', level, mulberry32(2)).type).toBe('draw')
      const drawn = {
        ...stuck,
        players: { ...stuck.players, a: { ...stuck.players.a, drawRight: false } },
      }
      expect(decideBotAction(drawn, 'a', level, mulberry32(2)).type).toBe('pass')
    }
  })

  it('normal cuts with 57 when it can', () => {
    const core = setup(5, ['a', 'b'])
    const c: GameCore = {
      ...core,
      players: { ...core.players, a: { hand: ['5S', '7S', '4S', '6S', '8S'], drawRight: true } },
      currentPlayer: 'a',
      field: [['2S', '3H']],
    }
    expect(decideBotAction(c, 'a', 'normal', mulberry32(1))).toMatchObject({ submit: ['5S', '7S'] })
  })

  it('strong beats weak more often than not', () => {
    let wins = 0
    const games = 6
    for (let seed = 100; seed < 100 + games; seed += 1) {
      const end = playGame({ s: 'strong', w: 'weak' }, seed)
      if (end.winner === 's') {
        wins += 1
      }
    }
    expect(wins).toBeGreaterThanOrEqual(4)
  })
})
