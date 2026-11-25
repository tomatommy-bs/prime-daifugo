/**
 * Command handling (spec §3.6, §3.7, §5 turn guard, §6.1). Every command gets exactly one ack
 * (RQ-S18). A rejected command emits nothing and leaves the state reference-equal.
 */
import type { EngineReject, Move } from '../game/types'
import type { Cmd, RejectReason } from '../shared/protocol'
import { shuffle } from '../shared/rng'
import { parseRulePatch } from '../shared/rule-options'
import { endGame, forfeitIfSeated, gameOf, removeMember, setCore } from './game-ops'
import { readyCandidates } from './members'
import { turnDurationMs } from './timers'
import type { Tx } from './tx'
import type { Pid, SessionInput } from './types'

type CommandInput = Extract<SessionInput, { type: 'command' }>

/** Engine rejections map 1:1 onto protocol reasons. */
const ENGINE_REJECT: Record<EngineReject, RejectReason> = {
  'not-your-turn': 'not-your-turn',
  'bad-status': 'bad-status',
  'invalid-move': 'invalid-move',
  'invalid-fact': 'invalid-fact',
  'deck-empty': 'deck-empty',
  'already-drawn': 'already-drawn',
}

type Outcome = { ok: true } | { ok: false; reason: RejectReason }

const OK: Outcome = { ok: true }
const reject = (reason: RejectReason): Outcome => ({ ok: false, reason })

export function handleCommand(tx: Tx, input: CommandInput): void {
  const { pid, connNo, id, cmd } = input
  const member = tx.s.members[pid]
  const outcome: Outcome =
    !member || member.connNo !== connNo || !member.connected
      ? reject('not-member')
      : run(tx, pid, cmd)
  if (!outcome.ok) {
    tx.directive({ type: 'ack', pid, connNo, id, result: outcome })
    return
  }
  if (tx.events.length > 0 && tx.s.members[pid]) {
    tx.mut().members[pid].lastSeen = tx.deps.now
  }
  tx.directive({ type: 'ack', pid, connNo, id, result: { ok: true, seq: tx.s.version } })
  if (cmd.type === 'leave') {
    tx.directive({ type: 'bye', pid, connNo, reason: 'left', code: 4000 })
  }
}

function run(tx: Tx, pid: Pid, cmd: Cmd): Outcome {
  switch (cmd.type) {
    case 'ready':
    case 'unready':
      return setReady(tx, pid, cmd.type === 'ready')
    case 'set-rule':
      return setRule(tx, pid, cmd.rule)
    case 'start':
      return start(tx, pid, cmd.expectedVersion)
    case 'draw':
      return move(tx, pid, cmd.turn, { type: 'draw' })
    case 'pass':
      return move(tx, pid, cmd.turn, { type: 'pass' })
    case 'submit':
      return move(tx, pid, cmd.turn, { type: 'submit', submit: cmd.submit, factor: cmd.factor })
    default:
      return leave(tx, pid)
  }
}

/** Spec §3.6: forfeit if seated in a running game, then remove the member. */
function leave(tx: Tx, pid: Pid): Outcome {
  forfeitIfSeated(tx, pid, 'leave')
  removeMember(tx, pid)
  return OK
}

/** RQ-S10: allowed in `waiting`/`waitingNextRound`, observers included. Idempotent. */
function setReady(tx: Tx, pid: Pid, ready: boolean): Outcome {
  if (tx.s.status === 'playing') {
    return reject('bad-status')
  }
  if (tx.s.members[pid].ready === ready) {
    return OK
  }
  const m = tx.mut().members[pid]
  m.ready = ready
  m.readyAt = ready ? tx.deps.now : null
  tx.emit({ type: 'ready-changed', by: pid, ready })
  return OK
}

/** RQ-S11: only between games and only with allowed values. */
function setRule(tx: Tx, pid: Pid, patch: unknown): Outcome {
  if (tx.s.status === 'playing') {
    return reject('bad-status')
  }
  const parsed = parseRulePatch(patch, tx.s.rule)
  if (!parsed.ok) {
    return reject('bad-rule')
  }
  const current = tx.s.rule
  const unchanged = (Object.keys(parsed.rule) as (keyof typeof current)[]).every(
    (key) => parsed.rule[key] === current[key],
  )
  if (unchanged) {
    return OK
  }
  tx.mut().rule = { ...parsed.rule }
  tx.emit({ type: 'rule-changed', by: pid, rule: { ...parsed.rule } })
  return OK
}

/**
 * RQ-S12: `expectedVersion` must match (so concurrent starts deal once), status must be between
 * games, and at least 2 members must be ready and connected. The first `maxSeats` by `readyAt`
 * are seated in a shuffled order. Setup runs before anything changes.
 */
function start(tx: Tx, pid: Pid, expectedVersion: number): Outcome {
  const { deps } = tx
  if (expectedVersion !== tx.s.version) {
    return reject('stale')
  }
  if (tx.s.status === 'playing') {
    return reject('bad-status')
  }
  const candidates = readyCandidates(tx.s)
  if (candidates.length < 2) {
    return reject('not-enough-ready')
  }
  const seats = shuffle(candidates.slice(0, deps.config.maxSeats), deps.rng)
  const setup = deps.engine.setup(seats, tx.s.rule, deps.rng)
  if (!setup.ok) {
    return reject(setup.reason === 'deck-too-small' ? 'bad-rule' : 'not-enough-ready')
  }
  const s = tx.mut()
  const seated = new Set(seats)
  for (const [memberPid, member] of Object.entries(s.members)) {
    member.role = seated.has(memberPid) ? 'player' : 'observer'
  }
  s.status = 'playing'
  s.game = {
    round: (s.game?.round ?? 0) + 1,
    core: setup.core,
    deadline: deps.now + turnDurationMs(s, setup.core, deps.config),
    endReason: null,
  }
  tx.emit({ type: 'game-started', by: pid, round: s.game.round })
  return OK
}

/** RQ-R8, RQ-T6: draw/pass/submit with the turn guard, then the engine. */
function move(tx: Tx, pid: Pid, turn: number, mv: Move): Outcome {
  const { deps } = tx
  if (tx.s.status !== 'playing' || tx.s.game === null) {
    return reject('bad-status')
  }
  const { core } = tx.s.game
  if (turn !== core.turn) {
    return reject('stale')
  }
  if (core.currentPlayer !== pid) {
    return reject('not-your-turn')
  }
  const result = deps.engine.applyMove(core, pid, mv, deps.rng)
  if (!result.ok) {
    return reject(ENGINE_REJECT[result.reason])
  }
  setCore(tx, result.core)
  const { outcome } = result
  switch (outcome.kind) {
    case 'drew':
      tx.emit({ type: 'drew', by: pid })
      break
    case 'passed':
      tx.emit({ type: 'passed', by: pid, reason: 'manual', flowed: outcome.flowed })
      break
    default: {
      const submit = mv.type === 'submit' ? mv : { submit: [], factor: [] }
      tx.emit({
        type: 'submitted',
        by: pid,
        submit: [...submit.submit],
        factor: [...submit.factor],
        result: outcome.result,
        cut57: outcome.cut57,
        flowed: outcome.flowed,
        penalty: outcome.penalty,
      })
      if (outcome.ended && gameOf(tx.s).core.winner !== null) {
        endGame(tx, 'empty-hand')
      }
      break
    }
  }
  return OK
}
