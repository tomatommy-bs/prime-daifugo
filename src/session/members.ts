/**
 * Member helpers (spec §3.2). Presence is derived from members, never from sockets.
 */
import type { Member, Pid, RoomConfig, RoomState } from './types'

/** Number of connected members: the lobby/room count (RQ-S8). */
export function connectedCount(state: RoomState): number {
  let n = 0
  for (const member of Object.values(state.members)) {
    if (member.connected) {
      n += 1
    }
  }
  return n
}

export function memberCapacity(config: RoomConfig): number {
  return config.maxSeats + config.maxObservers
}

/** Stable ordering by `joinedAt`, then pid. */
export function byJoinedAt(members: Record<Pid, Member>): Pid[] {
  return Object.keys(members).sort((a, b) => {
    const d = members[a].joinedAt - members[b].joinedAt
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0
  })
}

/** Members eligible for a seat: ready and connected, ordered by `readyAt` (RQ-S12). */
export function readyCandidates(state: RoomState): Pid[] {
  const { members } = state
  return Object.keys(members)
    .filter((pid) => members[pid].ready && members[pid].connected)
    .sort((a, b) => {
      const ra = members[a].readyAt ?? Number.POSITIVE_INFINITY
      const rb = members[b].readyAt ?? Number.POSITIVE_INFINITY
      if (ra !== rb) {
        return ra - rb
      }
      const d = members[a].joinedAt - members[b].joinedAt
      return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0
    })
}

export function newMember(name: string, connNo: number, now: number, role: Member['role']): Member {
  return {
    name,
    joinedAt: now,
    ready: false,
    readyAt: null,
    role,
    connected: true,
    connNo,
    lastSeen: now,
    graceUntil: null,
  }
}

/** Shallow copy of the state deep enough that members, game and rule can be mutated in place. */
export function cloneState(state: RoomState): RoomState {
  const members: Record<Pid, Member> = {}
  for (const [pid, member] of Object.entries(state.members)) {
    members[pid] = { ...member }
  }
  return {
    ...state,
    rule: { ...state.rule },
    members,
    // `core` is never mutated: the engine returns a new one, which replaces it.
    game: state.game ? { ...state.game } : null,
  }
}
