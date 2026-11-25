import { describe, expect, it } from 'vitest'
import type { CardId, GameCore, GameEngine } from '../game/types'
import { DEFAULT_RULE } from '../shared/rule-options'
import { REDUCER_IS_STUB, initialRoomState, roomReduce } from './reducer'
import { Driver } from './testing/driver'
import { createFakeEngine, fakeEngine, fullDeck } from './testing/fake-engine'
import type { Directive, RoomState } from './types'
import { DEFAULT_ROOM_CONFIG, RING_SIZE } from './types'

const CFG = DEFAULT_ROOM_CONFIG
const T = DEFAULT_RULE.timeLimit * 1000

function patchCore(d: Driver, fn: (core: GameCore) => void): void {
  const core = JSON.parse(JSON.stringify(d.game.core)) as GameCore
  fn(core)
  d.state = { ...d.state, game: { ...d.game, core } }
}

function directivesOf(d: Driver, type: Directive['type']) {
  return (d.last?.directives ?? []).filter((x) => x.type === type)
}

function allCards(core: GameCore): string[] {
  return [
    ...Object.values(core.players).flatMap((p) => p.hand),
    ...core.field.flat(),
    ...core.deck,
  ].sort()
}

describe('initialRoomState', () => {
  it('starts an empty waiting room with the default rule', () => {
    const s = initialRoomState('r', 'e', CFG)
    expect(s).toMatchObject({
      schema: 1,
      roomId: 'r',
      epoch: 'e',
      version: 0,
      ringFloor: 1,
      status: 'waiting',
      members: {},
      game: null,
      gcAt: null,
    })
    expect(s.rule).toEqual(DEFAULT_RULE)
    expect(REDUCER_IS_STUB).toBe(false)
  })
})

describe('connect', () => {
  it('adds a new member, emits presence and welcomes with a snapshot', () => {
    const d = new Driver()
    const r = d.connect('a', '  alice ')
    expect(r.events).toEqual([{ seq: 1, e: { type: 'presence' } }])
    expect(r.state.version).toBe(1)
    expect(r.state.members.a).toMatchObject({
      name: 'alice',
      connected: true,
      connNo: 1,
      ready: false,
      role: 'player',
      graceUntil: null,
      joinedAt: d.now,
    })
    expect(r.directives).toEqual([
      { type: 'welcome', pid: 'a', connNo: 1, mode: 'snapshot', fromSeq: 2 },
    ])
    expect(r.lobbyCount).toBe(1)
    expect(r.wakeAt).toBeNull()
    expect(r.state.gcAt).toBeNull()
  })

  it('rejects a bad name with bye 4003 and changes nothing', () => {
    const d = new Driver()
    const before = d.state
    const r = d.connect('a', 'ab')
    expect(r.state).toBe(before)
    expect(r.events).toEqual([])
    expect(r.directives).toEqual([
      { type: 'bye', pid: 'a', connNo: 1, reason: 'bad-name', code: 4003 },
    ])
  })

  it('rejects the 13th member with room-full (4002)', () => {
    const d = new Driver()
    for (let i = 0; i < 12; i += 1) {
      d.connect(`p${i}`)
    }
    const before = d.state
    const r = d.connect('late')
    expect(r.state).toBe(before)
    expect(r.directives).toEqual([
      { type: 'bye', pid: 'late', connNo: 1, reason: 'room-full', code: 4002 },
    ])
    // an existing member can still reconnect to a full room
    d.connect('p3')
    expect(d.last?.directives.some((x) => x.type === 'welcome')).toBe(true)
  })

  it('newest connection wins: the old socket gets bye superseded 4001', () => {
    const d = new Driver()
    d.connect('a', 'alice')
    const v = d.state.version
    const r = d.connect('a', 'alice', { lastSeq: v, epoch: 'ep1' })
    expect(r.events).toEqual([]) // still connected, same name: nothing to announce
    expect(r.directives).toEqual([
      { type: 'bye', pid: 'a', connNo: 1, reason: 'superseded', code: 4001 },
      { type: 'welcome', pid: 'a', connNo: 2, mode: 'current', fromSeq: v + 1 },
    ])
    expect(r.state.members.a.connNo).toBe(2)
    // a stale close from the superseded socket is ignored
    const before = d.state
    expect(d.disconnect('a', 1).state).toBe(before)
    // a command from the superseded socket is not accepted
    d.cmd('a', { type: 'ready' }, 1)
    expect(d.ack).toEqual({ ok: false, reason: 'not-member' })
  })

  it('a different valid name on a later hello updates the member', () => {
    const d = new Driver()
    d.connect('a', 'alice')
    const r = d.connect('a', 'alicia')
    expect(r.state.members.a.name).toBe('alicia')
    expect(r.events.map((e) => e.e.type)).toEqual(['presence'])
  })

  it('an out-of-order hello (connNo not newer) is superseded at once', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('a')
    const before = d.state
    const r = d.step({
      type: 'connect',
      pid: 'a',
      name: 'alice',
      connNo: 1,
      lastSeq: null,
      epoch: null,
    })
    expect(r.state).toBe(before)
    expect(r.directives).toEqual([
      { type: 'bye', pid: 'a', connNo: 1, reason: 'superseded', code: 4001 },
    ])
  })

  it('chooses replay when the gap is still in the ring', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    const seen = d.state.version
    d.disconnect('a')
    d.cmd('b', { type: 'ready' })
    const r = d.connect('a', 'n-a', { lastSeq: seen, epoch: 'ep1' })
    expect(r.directives).toEqual([
      { type: 'welcome', pid: 'a', connNo: 2, mode: 'replay', fromSeq: seen + 1 },
    ])
    expect(r.state.members.a).toMatchObject({ connected: true, graceUntil: null })
  })

  it('falls back to a snapshot for another epoch, a gap below the ring, or a future seq', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    d.connect('b', 'n-b', { lastSeq: 1, epoch: 'old-epoch' })
    expect(directivesOf(d, 'welcome')[0]).toMatchObject({ mode: 'snapshot' })
    d.connect('b', 'n-b', { lastSeq: 999, epoch: 'ep1' })
    expect(directivesOf(d, 'welcome')[0]).toMatchObject({ mode: 'snapshot' })
    for (let i = 0; i < RING_SIZE + 5; i += 1) {
      d.cmd('a', { type: i % 2 === 0 ? 'ready' : 'unready' })
    }
    expect(d.state.ringFloor).toBe(d.state.version - RING_SIZE + 1)
    d.connect('b', 'n-b', { lastSeq: 2, epoch: 'ep1' })
    expect(directivesOf(d, 'welcome')[0]).toMatchObject({ mode: 'snapshot' })
    // the edge of the ring still replays
    d.disconnect('b')
    // the reconnect's own presence event moves the floor up by one
    const lastSeq = d.state.ringFloor
    d.connect('b', 'n-b', { lastSeq, epoch: 'ep1' })
    expect(d.state.ringFloor).toBe(lastSeq + 1)
    expect(directivesOf(d, 'welcome')[0]).toMatchObject({ mode: 'replay', fromSeq: lastSeq + 1 })
  })

  it('a member joining mid-game is an observer without a hand (RQ-S13)', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    d.connect('c')
    expect(d.state.members.c.role).toBe('observer')
    expect(d.game.core.players.c).toBeUndefined()
  })
})

describe('disconnect', () => {
  it('keeps the member with an idle grace and starts the GC clock when nobody is left', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'ready' })
    const r = d.disconnect('a')
    expect(r.events.map((e) => e.e.type)).toEqual(['presence'])
    expect(r.state.members.a).toMatchObject({
      connected: false,
      ready: true,
      graceUntil: d.now + CFG.graceIdleMs,
    })
    expect(r.state.gcAt).toBe(d.now + CFG.roomTtlIdleMs)
    expect(r.wakeAt).toBe(d.now + CFG.graceIdleMs)
    expect(r.lobbyCount).toBe(0)
    // reconnecting cancels the GC
    d.advance(1000)
    const back = d.connect('a')
    expect(back.state.gcAt).toBeNull()
    expect(back.state.members.a.graceUntil).toBeNull()
  })

  it('ignores unknown pids and already-disconnected members', () => {
    const d = new Driver()
    d.connect('a')
    const s = d.state
    expect(d.disconnect('zz', 1).state).toBe(s)
    d.disconnect('a')
    const s2 = d.state
    expect(d.disconnect('a').state).toBe(s2)
  })

  it('a seated player gets the playing grace and their turn is capped at 20 s (RQ-T3)', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    d.connect('o') // observer
    d.cmd('a', { type: 'set-rule', rule: { timeLimit: 300 } })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
    const cur = d.current
    const other = d.game.core.playOrder.find((p) => p !== cur) as string
    const deadline = d.game.deadline as number
    d.advance(1000)
    d.disconnect(other)
    expect(d.state.members[other].graceUntil).toBe(d.now + CFG.gracePlayingMs)
    expect(d.game.deadline).toBe(deadline) // not their turn: unchanged
    d.disconnect('o')
    expect(d.state.members.o.graceUntil).toBe(d.now + CFG.graceIdleMs)
    d.disconnect(cur)
    // timeLimit 60 s > 20 s cap → capped
    expect(d.game.deadline).toBe(Math.min(deadline, d.now + CFG.awayTurnCapMs))
    expect(d.state.gcAt).toBeNull() // someone is still connected
  })

  it('the cap never extends a deadline that is already sooner', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    d.advance(T - 5000)
    const deadline = d.game.deadline
    d.disconnect(cur)
    expect(d.game.deadline).toBe(deadline)
    // reconnecting does not extend it either
    d.connect(cur)
    expect(d.game.deadline).toBe(deadline)
  })
})

describe('ready / set-rule', () => {
  it('toggles ready with events and is idempotent', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'ready' })
    expect(d.eventTypes).toEqual(['ready-changed'])
    expect(d.state.members.a).toMatchObject({ ready: true, readyAt: d.now })
    expect(d.ack).toEqual({ ok: true, seq: d.state.version })
    const s = d.state
    d.cmd('a', { type: 'ready' })
    expect(d.state).toBe(s)
    expect(d.ack).toEqual({ ok: true, seq: s.version })
    d.cmd('a', { type: 'unready' })
    expect(d.state.members.a).toMatchObject({ ready: false, readyAt: null })
  })

  it('rejects commands from non-members', () => {
    const d = new Driver()
    const s = d.state
    const r = d.cmd('ghost', { type: 'ready' }, 1)
    expect(r.state).toBe(s)
    expect(r.directives).toEqual([
      {
        type: 'ack',
        pid: 'ghost',
        connNo: 1,
        id: expect.any(String),
        result: { ok: false, reason: 'not-member' },
      },
    ])
  })

  it('stores a valid rule and rejects out-of-set values (RQ-S11, RQ-R22)', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'set-rule', rule: { timeLimit: 15, halfEvenNumbers: true } })
    expect(d.state.rule).toEqual({ ...DEFAULT_RULE, timeLimit: 15, halfEvenNumbers: true })
    expect(d.last?.events[0].e).toEqual({ type: 'rule-changed', by: 'a', rule: d.state.rule })
    const s = d.state
    d.cmd('a', { type: 'set-rule', rule: { timeLimit: 16 } })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-rule' })
    expect(d.state).toBe(s)
    d.cmd('a', { type: 'set-rule', rule: { timeLimit: 15 } })
    expect(d.ack.ok).toBe(true)
    expect(d.state).toBe(s) // unchanged rule: nothing emitted
  })
})

describe('start', () => {
  it('seats the first 4 ready+connected members by readyAt in a shuffled order', () => {
    const d = new Driver()
    for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) {
      d.connect(p)
    }
    for (const p of ['e', 'a', 'd', 'b', 'c']) {
      d.advance(10)
      d.cmd(p, { type: 'ready' })
    }
    d.disconnect('a') // ready but disconnected: not eligible
    d.advance(10)
    d.cmd('f', { type: 'start', expectedVersion: d.state.version })
    expect(d.ack.ok).toBe(true)
    expect(d.eventTypes).toEqual(['game-started'])
    expect(d.state.status).toBe('playing')
    const seats = [...d.game.core.playOrder].sort()
    expect(seats).toEqual(['b', 'c', 'd', 'e'])
    expect(d.state.members.f.role).toBe('observer')
    expect(d.state.members.a.role).toBe('observer')
    for (const p of seats) {
      expect(d.state.members[p].role).toBe('player')
    }
    expect(d.game).toMatchObject({ round: 1, deadline: d.now + T, endReason: null })
    expect(d.last?.events[0].e).toEqual({ type: 'game-started', by: 'f', round: 1 })
    expect(d.last?.wakeAt).toBe(d.state.members.a.graceUntil)
  })

  it('needs two ready connected members', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    d.cmd('a', { type: 'ready' })
    const s = d.state
    d.cmd('a', { type: 'start', expectedVersion: s.version })
    expect(d.ack).toEqual({ ok: false, reason: 'not-enough-ready' })
    expect(d.state).toBe(s)
  })

  it('a stale expectedVersion is rejected, so two simultaneous starts deal once', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    d.cmd('a', { type: 'ready' })
    d.cmd('b', { type: 'ready' })
    const v = d.state.version
    d.cmd('a', { type: 'start', expectedVersion: v })
    expect(d.ack.ok).toBe(true)
    const dealt = d.state
    d.cmd('b', { type: 'start', expectedVersion: v })
    expect(d.ack).toEqual({ ok: false, reason: 'stale' })
    expect(d.state).toBe(dealt)
    d.cmd('b', { type: 'start', expectedVersion: d.state.version })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
  })

  it('a setup failure leaves the room unchanged', () => {
    const d = new Driver()
    for (const p of ['a', 'b', 'c', 'd']) {
      d.connect(p)
      d.cmd(p, { type: 'ready' })
    }
    d.cmd('a', { type: 'set-rule', rule: { initNumCards: 11, halfEvenNumbers: true } })
    const s = d.state
    d.cmd('a', { type: 'start', expectedVersion: s.version })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-rule' })
    expect(d.state).toBe(s)
    const failing: GameEngine = {
      ...fakeEngine,
      setup: () => ({ ok: false, reason: 'bad-player-count' }),
    }
    const d2 = new Driver({ engine: failing })
    d2.connect('a')
    d2.connect('b')
    d2.cmd('a', { type: 'ready' })
    d2.cmd('b', { type: 'ready' })
    d2.cmd('a', { type: 'start', expectedVersion: d2.state.version })
    expect(d2.ack).toEqual({ ok: false, reason: 'not-enough-ready' })
  })

  it('uses the stored rule', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'set-rule', rule: { initNumCards: 4, timeLimit: 15 } })
    d.startGame(['a', 'b'])
    expect(d.game.core.rule).toEqual(d.state.rule)
    for (const p of d.game.core.playOrder) {
      expect(d.game.core.players[p].hand).toHaveLength(4)
    }
    expect(d.game.deadline).toBe(d.now + 15_000)
  })
})

describe('moves', () => {
  it('rejects moves outside a game, with a stale turn, or from the wrong seat', () => {
    const d = new Driver()
    d.connect('a')
    d.cmd('a', { type: 'pass', turn: 0 })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
    d.startGame(['a', 'b'])
    d.connect('o')
    const cur = d.current
    const other = cur === 'a' ? 'b' : 'a'
    const s = d.state
    d.cmd(other, { type: 'pass', turn: d.turn })
    expect(d.ack).toEqual({ ok: false, reason: 'not-your-turn' })
    d.cmd('o', { type: 'draw', turn: d.turn })
    expect(d.ack).toEqual({ ok: false, reason: 'not-your-turn' })
    d.cmd(cur, { type: 'pass', turn: d.turn + 1 })
    expect(d.ack).toEqual({ ok: false, reason: 'stale' })
    d.cmd('o', { type: 'ready' })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
    expect(d.state).toBe(s)
    expect(d.last?.directives).toHaveLength(1)
  })

  it('maps engine rejections and leaves the state reference-equal', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    d.cmd(cur, { type: 'draw', turn: d.turn })
    expect(d.eventTypes).toEqual(['drew'])
    const s = d.state
    d.cmd(cur, { type: 'draw', turn: d.turn })
    expect(d.ack).toEqual({ ok: false, reason: 'already-drawn' })
    expect(d.state).toBe(s)
    expect(d.last?.events).toEqual([])
    d.cmd(cur, { type: 'submit', turn: d.turn, submit: [], factor: [] })
    expect(d.ack).toEqual({ ok: false, reason: 'invalid-move' })
    const card = d.game.core.players[cur].hand[0]
    d.cmd(cur, { type: 'submit', turn: d.turn, submit: [card], factor: ['*'] })
    expect(d.ack).toEqual({ ok: false, reason: 'invalid-fact' })
    patchCore(d, (c) => {
      c.players[cur].drawRight = true
      c.deck = []
    })
    d.cmd(cur, { type: 'draw', turn: d.turn })
    expect(d.ack).toEqual({ ok: false, reason: 'deck-empty' })
  })

  it('a draw keeps the deadline; a pass starts a new one (RQ-T1)', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const deadline = d.game.deadline
    d.advance(5000)
    d.cmd(d.current, { type: 'draw', turn: d.turn })
    expect(d.game.deadline).toBe(deadline)
    const cur = d.current
    d.cmd(cur, { type: 'pass', turn: d.turn })
    expect(d.last?.events[0].e).toEqual({
      type: 'passed',
      by: cur,
      reason: 'manual',
      flowed: false,
    })
    expect(d.ack).toEqual({ ok: true, seq: d.state.version })
    expect(d.game.deadline).toBe(d.now + T)
    expect(d.current).not.toBe(cur)
  })

  it('a turn passing to a disconnected player gets the capped deadline', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    const other = cur === 'a' ? 'b' : 'a'
    d.disconnect(other)
    d.cmd(cur, { type: 'pass', turn: d.turn })
    expect(d.game.deadline).toBe(d.now + CFG.awayTurnCapMs)
  })

  it('a failed submit draws the penalty; a winning submit emits submitted then game-ended', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    patchCore(d, (c) => {
      c.players[cur].hand = ['2H', 'AS'] as CardId[]
    })
    d.cmd(cur, { type: 'submit', turn: d.turn, submit: ['2H'], factor: [] })
    expect(d.last?.events[0].e).toMatchObject({
      type: 'submitted',
      result: 'BASE_IS_NOT_PRIME',
      penalty: 1,
    })
    expect(d.game.core.players[cur].hand).toHaveLength(3)
    // back to cur, now win with a single black card
    const other = d.current
    d.cmd(other, { type: 'pass', turn: d.turn })
    patchCore(d, (c) => {
      c.players[cur].hand = ['AS'] as CardId[]
    })
    d.cmd(cur, { type: 'submit', turn: d.turn, submit: ['AS'], factor: [] })
    expect(d.eventTypes).toEqual(['submitted', 'game-ended'])
    expect(d.last?.events.map((e) => e.seq)).toEqual([d.state.version - 1, d.state.version])
    expect(d.last?.events[1].e).toEqual({
      type: 'game-ended',
      winnerId: cur,
      winnerName: `n-${cur}`,
      reason: 'empty-hand',
    })
    expect(d.state.status).toBe('waitingNextRound')
    expect(d.game.deadline).toBeNull()
    expect(d.game.endReason).toBe('empty-hand')
    expect(d.last?.wakeAt).toBeNull()
    d.cmd(other, { type: 'pass', turn: d.turn })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
  })

  it('a 57 cut keeps the turn but restarts the deadline', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    patchCore(d, (c) => {
      const others = Object.entries(c.players)
        .filter(([p]) => p !== cur)
        .flatMap(([, pl]) => pl.hand)
      c.players[cur].hand = ['5S', '7H', 'KS'] as CardId[]
      c.deck = fullDeck(c.rule).filter(
        (x) => !others.includes(x) && !c.players[cur].hand.includes(x),
      )
    })
    d.advance(3000)
    const turn = d.turn
    d.cmd(cur, { type: 'submit', turn, submit: ['5S', '7H'], factor: [] })
    expect(d.last?.events[0].e).toMatchObject({ type: 'submitted', cut57: true, flowed: true })
    expect(d.current).toBe(cur)
    expect(d.turn).toBe(turn + 1)
    expect(d.game.deadline).toBe(d.now + T)
  })
})

describe('leave', () => {
  it('in the waiting room: removes the member, acks and says bye left 4000', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    const r = d.cmd('b', { type: 'leave' })
    expect(r.events.map((e) => e.e)).toEqual([{ type: 'member-left', pid: 'b', name: 'n-b' }])
    expect(r.state.members.b).toBeUndefined()
    expect(r.directives).toEqual([
      {
        type: 'ack',
        pid: 'b',
        connNo: 1,
        id: expect.any(String),
        result: { ok: true, seq: r.state.version },
      },
      { type: 'bye', pid: 'b', connNo: 1, reason: 'left', code: 4000 },
    ])
  })

  it('in a two-player game: forfeit, the other seat wins (last standing)', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const before = allCards(d.game.core)
    d.cmd('b', { type: 'leave' })
    expect(d.eventTypes).toEqual(['forfeited', 'game-ended', 'member-left'])
    expect(d.last?.events[0].e).toEqual({ type: 'forfeited', pid: 'b', reason: 'leave' })
    expect(d.last?.events[1].e).toMatchObject({ winnerId: 'a', reason: 'last-standing' })
    expect(d.state.status).toBe('waitingNextRound')
    expect(d.game.deadline).toBeNull()
    expect(allCards(d.game.core)).toEqual(before)
  })

  it('in a three-player game: the game goes on and the turn moves on if it was theirs', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    const cur = d.current
    d.advance(2000)
    d.cmd(cur, { type: 'leave' })
    expect(d.eventTypes).toEqual(['forfeited', 'member-left'])
    expect(d.state.status).toBe('playing')
    expect(d.game.core.playOrder).not.toContain(cur)
    expect(d.current).not.toBe(cur)
    expect(d.game.deadline).toBe(d.now + T)
  })

  it('after the game ended: just leaves (no forfeit)', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    d.cmd('c', { type: 'leave' })
    d.cmd('b', { type: 'leave' })
    expect(d.state.status).toBe('waitingNextRound')
    d.connect('b')
    d.cmd('a', { type: 'leave' })
    expect(d.eventTypes).toEqual(['member-left'])
  })
})

describe('tick', () => {
  it('is a no-op when nothing is due (duplicate or early alarms)', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const s = d.state
    const r = d.tick()
    expect(r.state).toBe(s)
    expect(r.events).toEqual([])
    expect(r.directives).toEqual([])
  })

  it('passes for the current player at the deadline, once (RQ-T2, RQ-T6)', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    d.advance(T)
    d.tick()
    expect(d.last?.events[0].e).toEqual({
      type: 'passed',
      by: cur,
      reason: 'timeout',
      flowed: false,
    })
    expect(d.current).not.toBe(cur)
    expect(d.game.deadline).toBe(d.now + T)
    const s = d.state
    expect(d.tick().state).toBe(s)
  })

  it('a timed-out turn moving to a disconnected player is capped', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const cur = d.current
    const other = cur === 'a' ? 'b' : 'a'
    d.disconnect(other)
    d.advance(T)
    d.tick()
    expect(d.current).toBe(other)
    expect(d.game.deadline).toBe(d.now + CFG.awayTurnCapMs)
  })

  it('grace expiry forfeits a seated player and conserves cards (RQ-S6)', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    const before = allCards(d.game.core)
    d.disconnect('b')
    d.advance(CFG.gracePlayingMs - 1)
    d.tick()
    expect(d.state.members.b).toBeDefined()
    d.advance(1)
    // run every due tick (timeouts may fire first)
    d.tick()
    expect(d.state.members.b).toBeUndefined()
    expect(d.game.core.playOrder).not.toContain('b')
    expect(allCards(d.game.core)).toEqual(before)
    expect(d.last?.events.map((e) => e.e.type)).toContain('forfeited')
  })

  it('grace expiry outside a game just removes the member', () => {
    const d = new Driver()
    d.connect('a')
    d.connect('b')
    d.disconnect('b')
    d.advance(CFG.graceIdleMs)
    d.tick()
    expect(d.eventTypes).toEqual(['member-left'])
    expect(d.state.members.b).toBeUndefined()
  })

  it('garbage-collects an unattended room at gcAt', () => {
    const d = new Driver()
    d.connect('a')
    d.disconnect('a')
    d.advance(CFG.graceIdleMs)
    d.tick()
    expect(d.state.gcAt).toBe(d.now - CFG.graceIdleMs + CFG.roomTtlIdleMs)
    expect(d.last?.wakeAt).toBe(d.state.gcAt)
    d.advance(CFG.roomTtlIdleMs)
    const r = d.tick()
    expect(r.directives).toEqual([
      { type: 'close', reason: 'room-gone', code: 4006 },
      { type: 'destroy' },
    ])
    expect(r.wakeAt).toBeNull()
    expect(r.lobbyCount).toBe(0)
  })
})

describe('reconcile (RQ-S19)', () => {
  it('changes nothing when every connected member has its socket', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    const s = d.state
    const r = d.reconcile([
      { pid: 'a', connNo: d.connNo('a') },
      { pid: 'b', connNo: d.connNo('b') },
    ])
    expect(r.state).toBe(s)
  })

  it('gives dropped members a fresh grace and floors the deadline at now + 10 s', () => {
    const d = new Driver()
    d.startGame(['a', 'b', 'c'])
    const cur = d.current
    const others = d.game.core.playOrder.filter((p) => p !== cur)
    d.advance(T - 2000)
    const r = d.reconcile([{ pid: cur, connNo: d.connNo(cur) }])
    expect(r.events.map((e) => e.e.type)).toEqual(['presence'])
    for (const p of others) {
      expect(d.state.members[p]).toMatchObject({
        connected: false,
        graceUntil: d.now + CFG.gracePlayingMs,
      })
    }
    expect(d.game.deadline).toBe(d.now + CFG.restartDeadlineFloorMs)
  })

  it('caps a dropped current player but never below the restart floor', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    d.cmd('a', { type: 'set-rule', rule: {} })
    d.reconcile([])
    // 60 s deadline capped to 20 s, which is above the 10 s floor
    expect(d.game.deadline).toBe(d.now + CFG.awayTurnCapMs)
    expect(d.state.gcAt).toBe(d.now + CFG.roomTtlActiveMs)
  })
})

describe('next round', () => {
  it('a mid-game joiner readies up in waitingNextRound and gets a seat; ready flags are kept', () => {
    const d = new Driver()
    d.startGame(['a', 'b'])
    d.connect('c')
    d.cmd('c', { type: 'ready' })
    expect(d.ack).toEqual({ ok: false, reason: 'bad-status' })
    d.cmd('b', { type: 'leave' })
    expect(d.state.status).toBe('waitingNextRound')
    d.cmd('c', { type: 'ready' })
    expect(d.ack.ok).toBe(true)
    expect(d.state.members.a.ready).toBe(true)
    d.cmd('c', { type: 'start', expectedVersion: d.state.version })
    expect(d.game.round).toBe(2)
    expect([...d.game.core.playOrder].sort()).toEqual(['a', 'c'])
    expect(d.state.members.c.role).toBe('player')
  })
})

describe('purity', () => {
  it('never mutates its input (inputs are deep-frozen by the driver)', () => {
    const d = new Driver({ seed: 7 })
    d.startGame(['a', 'b', 'c'])
    for (let i = 0; i < 30; i += 1) {
      d.advance(T)
      d.tick()
    }
    d.disconnect('a')
    d.advance(CFG.gracePlayingMs)
    d.tick()
    expect(d.state.members.a).toBeUndefined()
  })

  it('is deterministic for a seed', () => {
    const run = () => {
      const d = new Driver({ seed: 42, engine: createFakeEngine() })
      d.startGame(['a', 'b', 'c', 'd'])
      return JSON.stringify(d.state)
    }
    expect(run()).toBe(run())
  })

  it('roomReduce can be called directly', () => {
    const s = initialRoomState('r', 'e', CFG) as RoomState
    const r = roomReduce(
      s,
      { type: 'tick' },
      { now: 0, rng: { next: () => 0 }, engine: fakeEngine, config: CFG },
    )
    expect(r.state).toBe(s)
  })
})
