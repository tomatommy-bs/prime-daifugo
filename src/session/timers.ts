/**
 * Timer policy (spec §3.5, §5). Pure helpers over `RoomState`; every decision compares absolute
 * epoch-ms timestamps, so a duplicated or early alarm is a no-op (RQ-T6).
 */
import type { GameCore } from '../game/types'
import type { Pid, RoomConfig, RoomState, RoomStatus } from './types'

/**
 * Length of a turn that starts now (RQ-T1, RQ-T3): the rule's `timeLimit`, capped at
 * `awayTurnCapMs` while the current player is disconnected.
 */
export function turnDurationMs(state: RoomState, core: GameCore, config: RoomConfig): number {
  const full = core.rule.timeLimit * 1000
  const current = state.members[core.currentPlayer]
  return current?.connected ? full : Math.min(full, config.awayTurnCapMs)
}

/** True while `pid` holds a seat in a game that is still running. */
export function isSeatedInRunningGame(state: RoomState, pid: Pid): boolean {
  return (
    state.status === 'playing' &&
    state.game !== null &&
    state.game.core.winner === null &&
    state.game.core.playOrder.includes(pid)
  )
}

/** Grace for a member who disconnects now (spec §3.5). */
export function graceMsFor(state: RoomState, pid: Pid, config: RoomConfig): number {
  return isSeatedInRunningGame(state, pid) ? config.gracePlayingMs : config.graceIdleMs
}

/** How long an unattended room lives before GC (RQ-S15). */
export function gcTtlMs(status: RoomStatus, config: RoomConfig): number {
  return status === 'waiting' ? config.roomTtlIdleMs : config.roomTtlActiveMs
}

/** Next instant something is due: the running deadline, any grace expiry, or GC (spec §5). */
export function computeWakeAt(state: RoomState): number | null {
  let wake: number | null = null
  const consider = (at: number | null | undefined) => {
    if (at !== null && at !== undefined && (wake === null || at < wake)) {
      wake = at
    }
  }
  if (state.status === 'playing') {
    consider(state.game?.deadline)
  }
  for (const member of Object.values(state.members)) {
    consider(member.graceUntil)
  }
  consider(state.gcAt)
  return wake
}
