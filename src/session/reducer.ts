/**
 * Room reducer (spec §3-§6). Pure and synchronous: every session and timer decision lives here,
 * using only the injected engine, clock (`deps.now`) and RNG (`deps.rng`).
 */
import { CLOSE } from '../shared/ids'
import { isValidName, normalizeName } from '../shared/name'
import { DEFAULT_RULE } from '../shared/rule-options'
import { handleCommand } from './commands'
import { capAwayDeadline, forfeitIfSeated, gameOf, removeMember } from './game-ops'
import { connectedCount, memberCapacity, newMember } from './members'
import { graceMsFor, turnDurationMs } from './timers'
import { Tx } from './tx'
import type { InitialRoomState, Pid, RoomReducer, SessionInput } from './types'
import { ROOM_STATE_SCHEMA } from './types'

export const initialRoomState: InitialRoomState = (roomId, epoch, _config) => ({
  schema: ROOM_STATE_SCHEMA,
  roomId,
  epoch,
  version: 0,
  ringFloor: 1,
  status: 'waiting',
  rule: { ...DEFAULT_RULE },
  members: {},
  game: null,
  gcAt: null,
  lastReportedCount: 0,
  lastReportAt: 0,
})

export const roomReduce: RoomReducer = (state, input, deps) => {
  const tx = new Tx(state, deps)
  switch (input.type) {
    case 'connect':
      onConnect(tx, input)
      break
    case 'disconnect':
      onDisconnect(tx, input)
      break
    case 'command':
      handleCommand(tx, input)
      break
    case 'tick':
      onTick(tx)
      break
    default:
      onReconcile(tx, input)
      break
  }
  return tx.finish()
}

/* ------------------------------------------------------------------ */

/** Spec §3.3: newest connection wins; welcome mode from epoch/lastSeq/ring. */
function onConnect(tx: Tx, input: Extract<SessionInput, { type: 'connect' }>): void {
  const { pid, connNo } = input
  const { now, config } = tx.deps
  if (!isValidName(input.name)) {
    tx.directive({ type: 'bye', pid, connNo, reason: 'bad-name', code: CLOSE['bad-name'] })
    return
  }
  const name = normalizeName(input.name)
  const existing = tx.s.members[pid]
  if (existing) {
    if (connNo <= existing.connNo) {
      // out-of-order hello: an older socket must never displace a newer one
      tx.directive({ type: 'bye', pid, connNo, reason: 'superseded', code: CLOSE.superseded })
      return
    }
    const changed = !existing.connected || existing.name !== name
    if (existing.connected) {
      tx.directive({
        type: 'bye',
        pid,
        connNo: existing.connNo,
        reason: 'superseded',
        code: CLOSE.superseded,
      })
    }
    const m = tx.mut().members[pid]
    m.connected = true
    m.graceUntil = null
    m.connNo = connNo
    m.lastSeen = now
    m.name = name
    if (changed) {
      tx.emit({ type: 'presence' })
    }
  } else {
    if (Object.keys(tx.s.members).length >= memberCapacity(config)) {
      tx.directive({ type: 'bye', pid, connNo, reason: 'room-full', code: CLOSE['room-full'] })
      return
    }
    const s = tx.mut()
    s.members[pid] = newMember(name, connNo, now, s.status === 'waiting' ? 'player' : 'observer')
    tx.emit({ type: 'presence' })
  }

  const s = tx.s
  const { lastSeq } = input
  if (input.epoch === s.epoch && lastSeq !== null) {
    if (lastSeq === s.version) {
      tx.directive({ type: 'welcome', pid, connNo, mode: 'current', fromSeq: s.version + 1 })
      return
    }
    if (s.ringFloor <= lastSeq + 1 && lastSeq + 1 <= s.version) {
      tx.directive({ type: 'welcome', pid, connNo, mode: 'replay', fromSeq: lastSeq + 1 })
      return
    }
  }
  tx.directive({ type: 'welcome', pid, connNo, mode: 'snapshot', fromSeq: s.version + 1 })
}

/** Mark a member disconnected with a fresh grace and cap their running turn. */
function markDisconnected(tx: Tx, pid: Pid): void {
  const { now, config } = tx.deps
  const graceMs = graceMsFor(tx.s, pid, config)
  const m = tx.mut().members[pid]
  m.connected = false
  m.lastSeen = now
  m.graceUntil = now + graceMs
  capAwayDeadline(tx, pid)
}

/** Spec §3.4: stale closes (old connNo) are ignored. RQ-S4: no "left" broadcast. */
function onDisconnect(tx: Tx, input: Extract<SessionInput, { type: 'disconnect' }>): void {
  const member = tx.s.members[input.pid]
  if (!member || !member.connected || member.connNo !== input.connNo) {
    return
  }
  markDisconnected(tx, input.pid)
  tx.emit({ type: 'presence' })
}

/** Spec §5 `tick`: timeout pass, grace expiry, GC — each decided by timestamp (RQ-T6). */
function onTick(tx: Tx): void {
  const { now, engine, rng, config } = tx.deps
  const s0 = tx.s
  if (s0.status === 'playing' && s0.game?.deadline != null && now >= s0.game.deadline) {
    const by = s0.game.core.currentPlayer
    const { core, outcome } = engine.timeoutPass(s0.game.core, rng)
    const s = tx.mut()
    const game = gameOf(s)
    game.core = core
    // RQ-T2: the timeout is a pass, which always starts a new turn and a new deadline
    game.deadline = now + turnDurationMs(s, core, config)
    tx.emit({ type: 'passed', by, reason: 'timeout', flowed: outcome.flowed })
  }

  const members = tx.s.members
  const expired = Object.keys(members)
    .filter((pid) => {
      const m = members[pid]
      return !m.connected && m.graceUntil !== null && m.graceUntil <= now
    })
    .sort((a, b) => {
      const d = (members[a].graceUntil as number) - (members[b].graceUntil as number)
      return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0
    })
  for (const pid of expired) {
    forfeitIfSeated(tx, pid, 'grace')
    removeMember(tx, pid)
  }

  if (tx.s.gcAt !== null && tx.s.gcAt <= now && connectedCount(tx.s) === 0) {
    tx.directive({ type: 'close', reason: 'room-gone', code: CLOSE['room-gone'] })
    tx.directive({ type: 'destroy' })
    tx.destroy()
  }
}

/**
 * RQ-S19: on wake, members marked connected without a live socket get a fresh grace; if that
 * happened during a game, the running deadline becomes at least now + restartDeadlineFloorMs.
 * A wake where every socket survived (hibernation) changes nothing.
 */
function onReconcile(tx: Tx, input: Extract<SessionInput, { type: 'reconcile' }>): void {
  const live = new Set(input.live.map((c) => `${c.pid}\u0000${c.connNo}`))
  const members = tx.s.members
  const dropped = Object.keys(members)
    .filter((pid) => members[pid].connected && !live.has(`${pid}\u0000${members[pid].connNo}`))
    .sort()
  if (dropped.length === 0) {
    return
  }
  for (const pid of dropped) {
    markDisconnected(tx, pid)
  }
  const s = tx.s
  if (s.status === 'playing' && s.game !== null && s.game.deadline !== null) {
    const floor = tx.deps.now + tx.deps.config.restartDeadlineFloorMs
    if (s.game.deadline < floor) {
      gameOf(tx.mut()).deadline = floor
    }
  }
  tx.emit({ type: 'presence' })
}
