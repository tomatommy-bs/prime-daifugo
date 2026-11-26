import { describe, expect, it } from 'vitest'
import { engine } from '../game/engine'
import { Driver } from './testing/driver'
import { DEFAULT_ROOM_CONFIG } from './types'
import { viewFor } from './view'

const CFG = DEFAULT_ROOM_CONFIG

/** A driver on the real engine (bots read real hands). */
const driver = (seed = 1) => new Driver({ engine, seed })

describe('bot seats', () => {
  it('adds a ready bot with the lowest free pid and shows it in the view', () => {
    const d = driver()
    d.connect('a')
    d.cmd('a', { type: 'add-bot', level: 'normal' })
    expect(d.ack).toMatchObject({ ok: true })
    expect(d.eventTypes).toEqual(['presence'])
    expect(d.state.members['bot-1']).toMatchObject({
      name: 'CPU1（ふつう）',
      ready: true,
      connected: true,
      role: 'player',
      bot: 'normal',
    })
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    d.cmd('a', { type: 'remove-bot', pid: 'bot-1' })
    d.cmd('a', { type: 'add-bot', level: 'strong' })
    expect(Object.keys(d.state.members).sort()).toEqual(['a', 'bot-1', 'bot-2'])
    expect(d.state.members['bot-1'].bot).toBe('strong')
    const row = viewFor(d.state, 'a').members.find((m) => m.id === 'bot-2')
    expect(row).toMatchObject({ bot: 'weak' })
    expect(viewFor(d.state, 'a').members.find((m) => m.id === 'a')).not.toHaveProperty('bot')
  })

  it('leaves a seat for a human', () => {
    const d = driver()
    d.connect('a')
    for (let i = 0; i < CFG.maxSeats - 1; i += 1) {
      d.cmd('a', { type: 'add-bot', level: 'weak' })
    }
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    expect(d.ack).toEqual({ ok: false, reason: 'too-many-bots' })
  })

  it('does not count bots as connected (lobby count, GC)', () => {
    const d = driver()
    d.connect('a')
    const r = d.cmd('a', { type: 'add-bot', level: 'weak' })
    expect(r.lobbyCount).toBe(1)
    const gone = d.cmd('a', { type: 'leave' })
    expect(gone.lobbyCount).toBe(0)
    expect(gone.state.gcAt).not.toBeNull()
  })

  it('removes only bots, and only between games', () => {
    const d = driver()
    d.connect('a')
    d.connect('b')
    d.cmd('a', { type: 'remove-bot', pid: 'b' })
    expect(d.ack).toEqual({ ok: false, reason: 'invalid-move' })
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    d.startGame(['a'])
    expect(d.state.status).toBe('playing')
    d.cmd('a', { type: 'remove-bot', pid: 'bot-1' })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
  })

  it('needs a human in the game', () => {
    const d = driver()
    d.connect('a')
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    d.cmd('a', { type: 'add-bot', level: 'weak' })
    d.cmd('a', { type: 'start', expectedVersion: d.state.version })
    expect(d.ack).toEqual({ ok: false, reason: 'not-enough-ready' })
  })

  it('seats ready humans before bots', () => {
    const d = driver()
    d.connect('a')
    for (let i = 0; i < 3; i += 1) {
      d.cmd('a', { type: 'add-bot', level: 'weak' })
    }
    d.connect('b')
    d.advance(5).cmd('b', { type: 'ready' })
    d.startGame(['a'])
    const seats = d.game.core.playOrder
    expect(seats).toHaveLength(CFG.maxSeats)
    expect(seats).toEqual(expect.arrayContaining(['a', 'b']))
  })
})

describe('bot turns', () => {
  /** Start a game of `a` and one bot whose turn comes first. */
  function botFirst(level: 'weak' | 'normal' | 'strong' = 'normal') {
    for (let seed = 1; seed < 50; seed += 1) {
      const d = driver(seed)
      d.connect('a')
      d.cmd('a', { type: 'add-bot', level })
      d.startGame(['a'])
      if (d.current === 'bot-1') {
        return d
      }
    }
    throw new Error('no seed puts the bot first')
  }

  it('schedules the bot within the think window and wakes for it', () => {
    const d = botFirst()
    const at = d.game.botAt as number
    expect(at).toBeGreaterThanOrEqual(d.now + CFG.botThinkMinMs)
    expect(at).toBeLessThan(d.now + CFG.botThinkMaxMs)
    expect(d.last?.wakeAt).toBe(at)
  })

  it('acts when due, then hands the turn to the human', () => {
    const d = botFirst()
    const turn = d.turn
    d.advance(CFG.botThinkMinMs - 1).tick()
    expect(d.turn).toBe(turn)
    d.now = d.game.botAt as number
    let guard = 0
    while (d.current === 'bot-1' && guard < 5) {
      d.tick()
      d.now = d.game.botAt ?? d.now
      guard += 1
    }
    expect(d.current).toBe('a')
    expect(d.game.botAt ?? null).toBeNull()
    expect(d.eventTypes.some((t) => ['submitted', 'passed'].includes(t))).toBe(true)
  })

  it('waits after a draw before its next action on the same turn', () => {
    const d = botFirst()
    // a five-card field is beyond the bot's reach: it can only draw, then pass
    const core = structuredClone(d.game.core)
    core.field = [['AS', 'AH', 'AC', 'AD', '3S']]
    core.deck = core.deck.filter((c) => !['AS', 'AH', 'AC', 'AD', '3S'].includes(c))
    for (const p of Object.values(core.players)) {
      p.hand = p.hand.filter((c) => !['AS', 'AH', 'AC', 'AD', '3S'].includes(c))
    }
    d.state = { ...d.state, game: { ...d.game, core } }
    d.now = d.game.botAt as number
    d.tick()
    expect(d.eventTypes).toEqual(['drew'])
    expect(d.current).toBe('bot-1')
    expect(d.game.botAt).toBe(d.now + CFG.botAfterDrawMs)
    d.advance(CFG.botAfterDrawMs).tick()
    expect(d.eventTypes[0]).toBe('passed')
    expect(d.current).toBe('a')
  })

  it('stays idle while no human is connected, and resumes on reconnect', () => {
    const d = botFirst()
    d.disconnect('a')
    // the human's disconnect does not cancel a bot already scheduled
    d.now = d.game.botAt as number
    d.tick()
    // whoever holds the turn now, a bot is never armed with nobody watching
    if (d.current === 'bot-1') {
      expect(d.game.botAt ?? null).toBeNull()
      d.connect('a')
      expect(d.game.botAt).not.toBeNull()
    }
  })

  it('plays whole games against a human who always passes', () => {
    for (const level of ['weak', 'normal', 'strong'] as const) {
      const d = botFirst(level)
      let steps = 0
      while (d.state.status === 'playing' && steps < 400) {
        if (d.current === 'a') {
          d.cmd('a', { type: 'pass', turn: d.turn })
        } else {
          d.now = Math.max(d.now, d.game.botAt as number)
          d.tick()
        }
        steps += 1
      }
      expect(d.state.status).toBe('waitingNextRound')
      expect(d.game.core.winner).toBe('bot-1')
    }
  })
})
