/**
 * Scripted simulator scenarios (spec §12.1). Every scenario runs the real reducer and view behind
 * the in-memory host, with invariants checked after every clock step. Every scenario runs with
 * both the fake engine and the real rules engine.
 */
import { describe, expect, it } from 'vitest'
import { engine as realEngine } from '../../game/engine'
import type { CardId, GameEngine } from '../../game/types'
import { fakeEngine } from '../testing/fake-engine'
import { DEFAULT_ROOM_CONFIG } from '../types'
import { cardMultiset } from './invariants'
import { SimWorld } from './world'

type Kit = { name: string; engine: GameEngine }
const KITS: Kit[] = [
  { name: 'fake engine', engine: fakeEngine },
  { name: 'real engine', engine: realEngine },
]

const CFG = DEFAULT_ROOM_CONFIG
const T = 60_000 // default rule timeLimit
const MIN = 60_000

function gameOf(w: SimWorld) {
  const game = w.state.game
  if (game === null) {
    throw new Error('no game')
  }
  return game
}

describe.each(KITS)('scenarios ($name)', ({ engine }) => {
  const world = (seed = 1) => new SimWorld({ seed, engine })

  /** Advance until `c`'s frames have reached the server. */
  const flushToServer = (w: SimWorld, c: { conn: { inFlightToServer: number } | null }) => {
    for (let i = 0; i < 1000 && c.conn && c.conn.inFlightToServer > 0; i += 1) {
      w.run(1)
    }
  }

  it('reload mid-turn keeps the seat, the hand and the turn', () => {
    const w = world(11)
    w.startGame(['alice', 'bob'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    const hand = [...gameOf(w).core.players[pid].hand]
    const turn = gameOf(w).core.turn
    const deadline = gameOf(w).deadline as number
    w.run(5000)
    me.reload()
    w.settle()
    expect(me.ready).toBe(true)
    expect(me.model.welcomes.at(-1)?.mode).toBe('snapshot')
    expect(me.view?.game?.hand).toEqual(hand)
    expect(me.view?.game?.currentPlayer).toBe(pid)
    expect(me.view?.game?.turn).toBe(turn)
    expect(w.state.members[pid]).toMatchObject({ role: 'player', connected: true })
    // the reload's disconnect may cap the turn, but never extends it
    expect(gameOf(w).deadline).toBeLessThanOrEqual(deadline)
    expect(w.timeline.some((e) => e.type === 'member-left' || e.type === 'forfeited')).toBe(false)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a 3 s blip on your own turn replays the missed events (no snapshot)', () => {
    const w = world(12)
    w.startGame(['alice', 'bob'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    const snapshots = me.model.snapshots
    const turn = gameOf(w).core.turn
    me.goOffline('reset')
    w.run(3000)
    me.goOnline()
    w.settle()
    expect(me.ready).toBe(true)
    expect(me.model.welcomes.at(-1)?.mode).toBe('replay')
    expect(me.model.snapshots).toBe(snapshots)
    expect(me.view?.game?.currentPlayer).toBe(pid)
    expect(me.view?.game?.turn).toBe(turn)
    expect(w.timeline.some((e) => e.type === 'member-left')).toBe(false)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a phone asleep 90 s on its turn is auto-passed within 20 s per turn, then comes back', () => {
    const w = world(13)
    w.startGame(['alice', 'bob'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    const handCount = gameOf(w).core.players[pid].hand.length
    const sleepAt = w.clock.now
    me.sleep({ closeSocket: true })
    w.run(90_000)
    const mine = w.timeline.filter(
      (e) => e.type === 'passed' && e.reason === 'timeout' && e.by === pid,
    )
    expect(mine.length).toBeGreaterThanOrEqual(1)
    expect(mine[0].at - sleepAt).toBeLessThanOrEqual(CFG.awayTurnCapMs + 500)
    // every later turn of the away player is capped at 20 s from its start
    const turnStarts = w.timeline.filter((e) => e.type === 'passed').map((e) => e.at)
    for (const t of mine.slice(1)) {
      const start = Math.max(...turnStarts.filter((s) => s < t.at))
      expect(t.at - start).toBeLessThanOrEqual(CFG.awayTurnCapMs)
    }
    me.wake()
    w.settle()
    expect(me.ready).toBe(true)
    expect(w.state.status).toBe('playing')
    expect(w.state.members[pid]).toMatchObject({ connected: true, role: 'player' })
    expect(gameOf(w).core.playOrder).toContain(pid)
    expect(me.view?.game?.hand.length).toBe(gameOf(w).core.players[pid].hand.length)
    expect(gameOf(w).core.players[pid].hand.length).toBe(handCount)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a phone asleep with a half-open socket is swept, auto-passed, and resumes its seat', () => {
    const w = world(14)
    w.startGame(['alice', 'bob'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    me.sleep()
    // the sweep runs every 60 s and drops sockets silent for 75 s
    w.run(140_000)
    expect(w.state.members[pid].connected).toBe(false) // the sweep found the silent socket
    expect(
      w.timeline.some((e) => e.type === 'passed' && e.by === pid && e.reason === 'timeout'),
    ).toBe(true)
    me.wake()
    w.settle()
    expect(me.ready).toBe(true)
    expect(w.state.members[pid]).toMatchObject({ connected: true, role: 'player' })
    expect(gameOf(w).core.playOrder).toContain(pid)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('asleep past grace: forfeit, cards back in the deck, the other seat wins', () => {
    const w = world(15)
    const [alice, bob] = w.startGame(['alice', 'bob'])
    const cards = cardMultiset(w.state)
    bob.sleep({ closeSocket: true })
    w.run(CFG.gracePlayingMs + 5000)
    expect(w.timeline.filter((e) => e.type === 'forfeited')).toEqual([
      expect.objectContaining({ by: bob.pid, reason: 'grace' }),
    ])
    expect(w.state.status).toBe('waitingNextRound')
    expect(w.state.members[bob.pid]).toBeUndefined()
    expect(gameOf(w).core.winner).toBe(alice.pid)
    expect(gameOf(w).core.playOrder).toEqual([alice.pid])
    expect(cardMultiset(w.state)).toEqual(cards)
    expect(alice.view?.game?.winner).toEqual({ id: alice.pid, name: 'alice' })
    expect(gameOf(w).deadline).toBeNull()
    bob.wake()
    w.settle()
    expect(bob.ready).toBe(true)
    expect(w.state.members[bob.pid].role).toBe('observer')
    expect(bob.view?.game?.hand).toEqual([])
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('the last connected player asleep 20 min: the room survives (no GC) and play resumes', () => {
    const w = world(16)
    const [alice, bob] = w.startGame(['alice', 'bob'])
    bob.send({ type: 'leave' })
    w.settle()
    expect(bob.terminal).toBe('left')
    expect(w.state.status).toBe('waitingNextRound')
    const epoch = w.state.epoch
    alice.sleep({ closeSocket: true })
    w.run(20 * MIN)
    expect(w.host.destroyedCount).toBe(0)
    expect(w.state.epoch).toBe(epoch)
    expect(w.state.gcAt).not.toBeNull()
    alice.wake()
    w.settle()
    expect(alice.ready).toBe(true)
    expect(w.state.epoch).toBe(epoch)
    expect(w.state.gcAt).toBeNull()
    const bob2 = w.addClient('bob', { pid: bob.pid })
    w.settle()
    w.startGame(['alice', 'bob'])
    expect(w.state.status).toBe('playing')
    expect(gameOf(w).round).toBe(2)
    expect(bob2.view?.game?.hand.length).toBe(w.state.rule.initNumCards)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('all disconnected for 31 min: the room is garbage-collected and starts a new epoch', () => {
    const w = world(17)
    const [alice, bob] = w.startGame(['alice', 'bob'])
    const epoch = w.state.epoch
    alice.goOffline()
    bob.goOffline()
    w.run(31 * MIN)
    expect(w.host.destroyedCount).toBe(1)
    expect(w.host.state).toBeNull()
    alice.goOnline()
    bob.goOnline()
    w.settle()
    expect(w.state.epoch).not.toBe(epoch)
    expect(w.state.status).toBe('waiting')
    expect(alice.model.welcomes.at(-1)?.mode).toBe('snapshot')
    expect(alice.view?.game).toBeNull()
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('duplicate tabs: the newest wins, the old tab stops, and resume takes the seat back', () => {
    const w = world(18)
    const [, bob] = w.startGame(['alice', 'bob'])
    const hand = [...gameOf(w).core.players[bob.pid].hand]
    const tab2 = w.secondTab(bob)
    w.settle()
    expect(bob.terminal).toBe('superseded')
    expect(tab2.ready).toBe(true)
    expect(tab2.view?.game?.hand).toEqual(hand)
    w.run(30_000)
    expect(bob.conn).toBeNull() // no auto-reconnect after 4001
    expect(w.host.liveConns().filter((c) => c.pid === bob.pid)).toHaveLength(1)
    expect(w.timeline.some((e) => e.type === 'member-left')).toBe(false)
    bob.resume()
    w.settle()
    expect(tab2.terminal).toBe('superseded')
    expect(bob.ready).toBe(true)
    expect(w.state.members[bob.pid].connected).toBe(true)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a duplicate hello on the same socket changes nothing', () => {
    const w = world(19)
    const [alice] = w.startGame(['alice', 'bob'])
    const version = w.state.version
    alice.duplicateHello()
    w.settle()
    expect(alice.terminal).toBeNull()
    expect(alice.ready).toBe(true)
    expect(w.state.version).toBe(version)
  })

  it('two simultaneous starts deal once', () => {
    const w = world(20)
    const alice = w.addClient('alice')
    const bob = w.addClient('bob')
    w.settle()
    alice.send({ type: 'ready' })
    bob.send({ type: 'ready' })
    w.settle()
    const v = w.state.version
    const a = alice.send({ type: 'start', expectedVersion: v })
    const b = bob.send({ type: 'start', expectedVersion: v })
    w.settle()
    expect(w.timeline.filter((e) => e.type === 'game-started')).toHaveLength(1)
    const acks = [alice.acks.get(a), bob.acks.get(b)]
    expect(acks.filter((x) => x?.ok)).toHaveLength(1)
    expect(acks.filter((x) => !x?.ok)).toEqual([{ ok: false, reason: 'stale' }])
  })

  it('the deckTopPlayer forfeits: the field flows at once', () => {
    const w = world(21)
    w.startGame(['alice', 'bob', 'carol'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    w.stageHand(pid, ['2S', '3S', '4S'] as CardId[])
    const cards = cardMultiset(w.state)
    w.move(me, { type: 'submit', submit: ['2S'] as CardId[], factor: [] })
    w.settle()
    expect(gameOf(w).core.deckTopPlayer).toBe(pid)
    expect(gameOf(w).core.field).toEqual([['2S']])
    me.send({ type: 'leave' })
    w.settle()
    expect(w.state.status).toBe('playing')
    expect(gameOf(w).core.playOrder).not.toContain(pid)
    expect(gameOf(w).core.field).toEqual([])
    expect(gameOf(w).core.deckTopPlayer).toBeNull()
    expect(cardMultiset(w.state)).toEqual(cards)
    for (const c of w.clients.filter((x) => x !== me)) {
      expect(c.view?.game?.field).toEqual([])
    }
  })

  it('the winner disconnects on the winning move: the game still ends with them as winner', () => {
    const w = world(22)
    w.startGame(['alice', 'bob'])
    const pid = w.currentPid() as string
    const me = w.clientByPid(pid)
    w.stageHand(pid, ['2S'] as CardId[])
    w.move(me, { type: 'submit', submit: ['2S'] as CardId[], factor: [] })
    flushToServer(w, me)
    me.goOffline('reset')
    w.settle()
    const types = w.timeline.map((e) => e.type)
    expect(types.slice(types.indexOf('submitted'), types.indexOf('submitted') + 2)).toEqual([
      'submitted',
      'game-ended',
    ])
    expect(w.state.status).toBe('waitingNextRound')
    expect(gameOf(w).core.winner).toBe(pid)
    expect(w.state.members[pid].connected).toBe(false)
    w.run(5000)
    me.goOnline()
    w.settle()
    expect(me.ready).toBe(true)
    expect(me.view?.game?.winner?.id).toBe(pid)
    expect(me.view?.status).toBe('waitingNextRound')
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a mid-game joiner observes and then plays the next round', () => {
    const w = world(23)
    const [, bob] = w.startGame(['alice', 'bob'])
    const carol = w.addClient('carol')
    w.settle()
    expect(w.state.members[carol.pid].role).toBe('observer')
    expect(carol.view?.game?.hand).toEqual([])
    const early = carol.send({ type: 'ready' })
    w.settle()
    expect(carol.acks.get(early)).toEqual({ ok: false, reason: 'bad-status' })
    bob.send({ type: 'leave' })
    w.settle()
    expect(w.state.status).toBe('waitingNextRound')
    carol.send({ type: 'ready' })
    w.settle()
    carol.send({ type: 'start', expectedVersion: w.state.version })
    w.settle()
    expect(gameOf(w).round).toBe(2)
    expect(gameOf(w).core.playOrder).toContain(carol.pid)
    expect(w.state.members[carol.pid].role).toBe('player')
    expect(carol.view?.game?.hand.length).toBe(w.state.rule.initNumCards)
    expect(w.checkCaughtUp()).toBe(2)
  })

  it('a rule change is seen by a late joiner and used by start', () => {
    const w = world(24)
    const alice = w.addClient('alice')
    w.settle()
    alice.send({ type: 'set-rule', rule: { timeLimit: 15, initNumCards: 4 } })
    w.settle()
    const carol = w.addClient('carol')
    w.settle()
    expect(carol.view?.rule).toEqual(w.state.rule)
    expect(carol.view?.rule).toMatchObject({ timeLimit: 15, initNumCards: 4 })
    w.startGame(['alice', 'carol'])
    expect(carol.view?.game?.hand).toHaveLength(4)
    const startedAt = w.timeline.find((e) => e.type === 'game-started')?.at
    expect(gameOf(w).deadline).toBe((startedAt ?? 0) + 15_000)
  })

  it('leave in the waiting room and in a game', () => {
    const w = world(25)
    const alice = w.addClient('alice')
    const bob = w.addClient('bob')
    w.settle()
    bob.send({ type: 'leave' })
    w.settle()
    expect(bob.terminal).toBe('left')
    expect(w.state.members[bob.pid]).toBeUndefined()
    expect(alice.view?.members.map((m) => m.id)).toEqual([alice.pid])
    w.run(30_000)
    expect(bob.conn).toBeNull() // no reconnect after leave

    const carol = w.addClient('carol')
    w.startGame(['alice', 'carol'])
    carol.send({ type: 'leave' })
    w.settle()
    expect(carol.terminal).toBe('left')
    expect(w.timeline.filter((e) => e.type === 'forfeited')).toEqual([
      expect.objectContaining({ by: carol.pid, reason: 'leave' }),
    ])
    expect(w.state.status).toBe('waitingNextRound')
    expect(alice.view?.game?.winner?.id).toBe(alice.pid)
    expect(w.checkCaughtUp()).toBe(1)
  })

  it('a deploy (crashRestart) during a turn keeps the deadline ≥ now + 10 s and every seat', () => {
    const w = world(26)
    w.startGame(['alice', 'bob', 'carol'])
    const pid = w.currentPid() as string
    const hands = JSON.stringify(gameOf(w).core.players)
    w.run(T - 3000)
    const restartAt = w.clock.now
    w.host.crashRestart()
    expect(gameOf(w).deadline).toBeGreaterThanOrEqual(restartAt + CFG.restartDeadlineFloorMs)
    w.run(CFG.restartDeadlineFloorMs - 1)
    expect(w.timeline.filter((e) => e.at >= restartAt && e.type === 'passed')).toEqual([])
    expect(gameOf(w).core.currentPlayer).toBe(pid)
    expect(JSON.stringify(gameOf(w).core.players)).toBe(hands)
    for (const c of w.clients) {
      expect(c.ready).toBe(true)
      expect(c.model.welcomes.at(-1)?.mode).toBe('replay')
    }
    expect(Object.values(w.state.members).every((m) => m.connected)).toBe(true)
    expect(w.checkCaughtUp()).toBe(3)
    // a later hibernation wake (sockets intact) changes nothing
    const before = w.host.state
    const r = w.host.hibernateWake()
    expect(r?.events).toEqual([])
    expect(w.host.state).toBe(before)
  })
})
