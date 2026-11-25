import { describe, expect, it } from 'vitest'
import { ViewSchema } from '../shared/protocol'
import { Driver } from './testing/driver'
import { viewFor } from './view'

describe('viewFor', () => {
  it('renders the waiting room with members sorted by joinedAt', () => {
    const d = new Driver()
    d.connect('zed', 'zelda')
    d.advance(5)
    d.connect('amy', 'amelia')
    d.cmd('amy', { type: 'ready' })
    d.disconnect('zed')
    const v = viewFor(d.state, 'amy')
    expect(ViewSchema.parse(v)).toEqual(v)
    expect(v).toEqual({
      roomId: 'room1',
      status: 'waiting',
      rule: d.state.rule,
      version: d.state.version,
      members: [
        { id: 'zed', name: 'zelda', ready: false, role: 'player', connected: false },
        { id: 'amy', name: 'amelia', ready: true, role: 'player', connected: true },
      ],
      game: null,
    })
  })

  it('breaks joinedAt ties by pid', () => {
    const d = new Driver()
    d.connect('b')
    d.connect('a')
    expect(viewFor(d.state, 'a').members.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('shows only the viewer’s own hand and hand counts for everyone (RQ-S16)', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    d.connect('o')
    const { core } = d.game
    for (const pid of ['a', 'b', 'c']) {
      const v = viewFor(d.state, pid)
      expect(ViewSchema.parse(v)).toEqual(v)
      expect(v.game?.hand).toEqual(core.players[pid].hand)
      expect(v.game?.deckCount).toBe(core.deck.length)
      expect(v.game?.players).toEqual(
        Object.fromEntries(
          Object.entries(core.players).map(([id, p]) => [
            id,
            { handCount: p.hand.length, drawRight: p.drawRight },
          ]),
        ),
      )
      const json = JSON.stringify(v)
      expect(json).not.toContain('"deck"')
      for (const other of ['a', 'b', 'c'].filter((p) => p !== pid)) {
        for (const card of core.players[other].hand) {
          expect(v.game?.hand).not.toContain(card)
          expect(json).not.toContain(`"${card}"`)
        }
      }
    }
    expect(viewFor(d.state, 'o').game?.hand).toEqual([])
    expect(viewFor(d.state, 'stranger').game?.hand).toEqual([])
    const v = viewFor(d.state, 'a')
    expect(v.game).toMatchObject({
      round: 1,
      turn: core.turn,
      playOrder: core.playOrder,
      currentPlayer: core.currentPlayer,
      field: [],
      deckTopPlayer: null,
      deadline: d.game.deadline,
      winner: null,
      lastResult: null,
    })
  })

  it('names the winner and keeps the result after the game ends', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    d.cmd('b', { type: 'leave' })
    const v = viewFor(d.state, 'a')
    expect(v.status).toBe('waitingNextRound')
    expect(v.game?.winner).toEqual({ id: 'a', name: 'n-a' })
    expect(v.game?.deadline).toBeNull()
    // a removed winner keeps an empty name rather than a raw id
    d.cmd('a', { type: 'leave' })
    expect(viewFor(d.state, 'x').game?.winner).toEqual({ id: 'a', name: '' })
  })

  it('returns copies, never references into the state', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const v = viewFor(d.state, 'a')
    v.game?.hand.push('AS')
    v.game?.playOrder.push('zz')
    expect(d.game.core.playOrder).not.toContain('zz')
  })
})
