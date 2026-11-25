import { describe, expect, it } from 'vitest'
import type { CardId, GameCore } from '../../game/types'
import { mulberry32 } from '../../shared/rng'
import { DEFAULT_RULE } from '../../shared/rule-options'
import { createFakeEngine, fullDeck } from './fake-engine'

const engine = createFakeEngine()
const rule = { ...DEFAULT_RULE, initNumCards: 4 }

function cards(core: GameCore): string[] {
  return [
    ...Object.values(core.players).flatMap((p) => p.hand),
    ...core.field.flat(),
    ...core.deck,
  ].sort()
}

function setup(seats = ['a', 'b', 'c']): GameCore {
  const r = engine.setup(seats, rule, mulberry32(3))
  if (!r.ok) {
    throw new Error(r.reason)
  }
  return r.core
}

describe('fake engine', () => {
  it('deals and validates the player count and deck size', () => {
    const core = setup()
    expect(core.playOrder).toEqual(['a', 'b', 'c'])
    expect(core.currentPlayer).toBe('a')
    expect(cards(core)).toEqual([...fullDeck(rule)].sort())
    expect(engine.setup(['a'], rule, mulberry32(1))).toEqual({
      ok: false,
      reason: 'bad-player-count',
    })
    expect(engine.setup(['a', 'a'], rule, mulberry32(1))).toEqual({
      ok: false,
      reason: 'bad-player-count',
    })
    expect(
      engine.setup(
        ['a', 'b', 'c', 'd'],
        { ...rule, initNumCards: 11, halfEvenNumbers: true },
        mulberry32(1),
      ),
    ).toEqual({ ok: false, reason: 'deck-too-small' })
    expect(fullDeck({ ...rule, halfEvenNumbers: true })).toHaveLength(40)
  })

  it('guards turns and status and never mutates its input', () => {
    const core = setup()
    const snap = JSON.stringify(core)
    expect(engine.applyMove(core, 'b', { type: 'pass' }, mulberry32(1))).toEqual({
      ok: false,
      reason: 'not-your-turn',
    })
    expect(
      engine.applyMove({ ...core, winner: 'a' }, 'a', { type: 'pass' }, mulberry32(1)),
    ).toEqual({
      ok: false,
      reason: 'bad-status',
    })
    const r = engine.applyMove(core, 'a', { type: 'draw' }, mulberry32(1))
    expect(r.ok).toBe(true)
    expect(JSON.stringify(core)).toBe(snap)
  })

  it('flows when the turn returns to the deckTopPlayer', () => {
    let core = setup(['a', 'b'])
    core = {
      ...core,
      players: { ...core.players, a: { hand: ['AS', '3H'] as CardId[], drawRight: true } },
    }
    const r1 = engine.applyMove(
      core,
      'a',
      { type: 'submit', submit: ['AS'], factor: [] },
      mulberry32(1),
    )
    if (!r1.ok) {
      throw new Error(r1.reason)
    }
    expect(r1.core.deckTopPlayer).toBe('a')
    expect(r1.core.field).toEqual([['AS']])
    const r2 = engine.timeoutPass(r1.core, mulberry32(1))
    expect(r2.outcome).toEqual({ kind: 'passed', flowed: true })
    expect(r2.core.field).toEqual([])
    expect(r2.core.deckTopPlayer).toBeNull()
  })

  it('rejects a submit whose size does not match the field', () => {
    let core = setup(['a', 'b'])
    core = { ...core, field: [['2S', '3S']] }
    const hand = core.players.a.hand
    expect(
      engine.applyMove(core, 'a', { type: 'submit', submit: [hand[0]], factor: [] }, mulberry32(1)),
    ).toEqual({
      ok: false,
      reason: 'invalid-move',
    })
  })

  it('forfeit: hand back to the deck, flow if deckTopPlayer, turn moves, last seat wins', () => {
    const base = setup(['a', 'b', 'c'])
    const total = cards(base)
    const withTop = {
      ...base,
      deckTopPlayer: 'b',
      field: [[base.deck[0]]],
      deck: base.deck.slice(1),
    }
    const f1 = engine.forfeit(withTop, 'b', mulberry32(1))
    expect(f1.flowed).toBe(true)
    expect(f1.ended).toBe(false)
    expect(f1.core.field).toEqual([])
    expect(f1.core.currentPlayer).toBe('a')
    expect(cards(f1.core)).toEqual(total)
    const f2 = engine.forfeit(f1.core, 'a', mulberry32(1))
    expect(f2.core.currentPlayer).toBe('c')
    expect(f2.core.turn).toBe(f1.core.turn) // the last seat wins at once
    expect(f2.ended).toBe(true)
    expect(f2.core.winner).toBe('c')
    expect(cards(f2.core)).toEqual(total)
    expect(engine.forfeit(f2.core, 'zz', mulberry32(1)).ended).toBe(true)
    const f3 = engine.forfeit(base, 'a', mulberry32(1))
    expect(f3.core.currentPlayer).toBe('b')
    expect(f3.core.turn).toBe(base.turn + 1)
  })
})
