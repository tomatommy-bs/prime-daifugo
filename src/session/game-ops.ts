/**
 * Game-level session operations shared by commands and timers: core replacement with the
 * deadline policy (spec §5), game end, forfeit (spec §3.6) and member removal.
 */
import type { GameCore } from '../game/types'
import { isSeatedInRunningGame, turnDurationMs } from './timers'
import type { Tx } from './tx'
import type { GameEndReason, Pid, RoomGame, RoomState } from './types'

/** The running game of a draft; callers check `status === 'playing'` first. */
export function gameOf(state: RoomState): RoomGame {
  if (state.game === null) {
    throw new Error('no game')
  }
  return state.game
}

/**
 * Replace the engine state. On every turn change (`core.turn` changed) the deadline restarts
 * (RQ-T1); a draw keeps it. A finished game is left for `endGame` to settle.
 */
export function setCore(tx: Tx, core: GameCore): void {
  const s = tx.mut()
  const game = gameOf(s)
  const prevTurn = game.core.turn
  game.core = core
  if (core.winner === null && core.turn !== prevTurn) {
    game.deadline = tx.deps.now + turnDurationMs(s, core, tx.deps.config)
  }
}

/** Settle a finished game: `waitingNextRound`, no deadline, `game-ended` (RQ-R18, RQ-T4). */
export function endGame(tx: Tx, reason: GameEndReason): void {
  const s = tx.mut()
  const game = gameOf(s)
  const winner = game.core.winner as Pid
  s.status = 'waitingNextRound'
  game.deadline = null
  game.endReason = reason
  tx.emit({
    type: 'game-ended',
    winnerId: winner,
    winnerName: s.members[winner]?.name ?? '',
    reason,
  })
}

/** RQ-T3: a disconnected current player's deadline is capped at now + awayTurnCapMs. */
export function capAwayDeadline(tx: Tx, pid: Pid): void {
  const s = tx.s
  if (s.status !== 'playing' || s.game === null || s.game.core.currentPlayer !== pid) {
    return
  }
  const cap = tx.deps.now + tx.deps.config.awayTurnCapMs
  if (s.game.deadline === null || s.game.deadline > cap) {
    gameOf(tx.mut()).deadline = cap
  }
}

/** Forfeit `pid` if seated in a running game (spec §3.6). */
export function forfeitIfSeated(tx: Tx, pid: Pid, reason: 'grace' | 'leave'): void {
  if (!isSeatedInRunningGame(tx.s, pid)) {
    return
  }
  const game = gameOf(tx.s)
  const result = tx.deps.engine.forfeit(game.core, pid, tx.deps.rng)
  setCore(tx, result.core)
  tx.emit({ type: 'forfeited', pid, reason })
  if (result.ended && result.core.winner !== null) {
    endGame(tx, 'last-standing')
  }
}

/** Remove a member and announce it. */
export function removeMember(tx: Tx, pid: Pid): void {
  const s = tx.mut()
  const member = s.members[pid]
  if (!member) {
    return
  }
  delete s.members[pid]
  tx.emit({ type: 'member-left', pid, name: member.name })
}
