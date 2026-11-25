import { describe, expect, it } from 'vitest'
import { Driver } from './testing/driver'
import { computeWakeAt, gcTtlMs, graceMsFor, isSeatedInRunningGame, turnDurationMs } from './timers'
import { DEFAULT_ROOM_CONFIG } from './types'

const CFG = DEFAULT_ROOM_CONFIG

describe('timers', () => {
  it('turn duration is the time limit, capped at 20 s for a disconnected current player', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'set-rule', rule: { timeLimit: 300 } })
    d.startGame(['a', 'b'])
    const core = d.game.core
    expect(turnDurationMs(d.state, core, CFG)).toBe(300_000)
    d.disconnect(core.currentPlayer)
    expect(turnDurationMs(d.state, core, CFG)).toBe(CFG.awayTurnCapMs)
    // a 15 s limit is already below the cap
    const short = { ...core, rule: { ...core.rule, timeLimit: 15 } }
    expect(turnDurationMs(d.state, short, CFG)).toBe(15_000)
  })

  it('grace depends on holding a seat in a running game', () => {
    const d = new Driver()
    d.connect('a')
    expect(graceMsFor(d.state, 'a', CFG)).toBe(CFG.graceIdleMs)
    d.startGame(['a', 'b'])
    d.connect('o')
    expect(isSeatedInRunningGame(d.state, 'a')).toBe(true)
    expect(graceMsFor(d.state, 'a', CFG)).toBe(CFG.gracePlayingMs)
    expect(graceMsFor(d.state, 'o', CFG)).toBe(CFG.graceIdleMs)
    d.cmd('b', { type: 'leave' })
    expect(isSeatedInRunningGame(d.state, 'a')).toBe(false)
  })

  it('GC TTL is 10 min while waiting and 30 min otherwise', () => {
    expect(gcTtlMs('waiting', CFG)).toBe(600_000)
    expect(gcTtlMs('playing', CFG)).toBe(1_800_000)
    expect(gcTtlMs('waitingNextRound', CFG)).toBe(1_800_000)
  })

  it('wakeAt is the earliest of deadline, grace and GC; no deadline outside playing', () => {
    const d = new Driver()
    expect(computeWakeAt(d.state)).toBeNull()
    d.startGame(['a', 'b', 'c'])
    const deadline = d.game.deadline as number
    expect(computeWakeAt(d.state)).toBe(deadline)
    d.disconnect('b')
    expect(computeWakeAt(d.state)).toBe(Math.min(deadline, d.state.members.b.graceUntil as number))
    d.state = { ...d.state, gcAt: 5 }
    expect(computeWakeAt(d.state)).toBe(5)
    d.state = { ...d.state, gcAt: null, status: 'waitingNextRound' }
    expect(computeWakeAt(d.state)).toBe(d.state.members.b.graceUntil)
  })
})
