/**
 * Simulator invariants (spec §3.8 and §12.1). Each check throws an `InvariantError` describing
 * the first violation; the simulator runs them after every clock step.
 */
import { CARD_IDS } from '../../shared/ids'
import type { RoomServerFrame, View } from '../../shared/protocol'
import { connectedCount } from '../members'
import type { ReducerResult, RoomState, SessionInput, ViewFor } from '../types'
import type { SimConn } from './sim-network'

export class InvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvariantError'
  }
}

function fail(message: string): never {
  throw new InvariantError(message)
}

/** §3.8 checks that only need the state, plus deadline ⇔ playing (RQ-T4). */
export function checkStateInvariants(state: RoomState): void {
  const members = state.members
  for (const [pid, m] of Object.entries(members)) {
    if (!m.connected && m.graceUntil === null) {
      fail(`member ${pid} is neither connected nor in grace`)
    }
    if (m.connected && m.graceUntil !== null) {
      fail(`member ${pid} is connected but has graceUntil`)
    }
  }
  if (state.status === 'playing') {
    const game = state.game
    if (game === null) {
      fail('playing without a game')
    }
    if (game.deadline === null) {
      fail('playing without a deadline')
    }
    if (game.core.winner !== null) {
      fail('playing with a winner')
    }
    for (const pid of game.core.playOrder) {
      if (!members[pid]) {
        fail(`playOrder holds non-member ${pid}`)
      }
      if (members[pid].role !== 'player') {
        fail(`playOrder holds ${pid} with role ${members[pid].role}`)
      }
    }
    if (!game.core.playOrder.includes(game.core.currentPlayer)) {
      fail('currentPlayer not in playOrder')
    }
  } else if (state.game !== null && state.game.deadline !== null) {
    fail(`deadline set while ${state.status}`)
  }
  if (state.ringFloor < 1 || state.ringFloor > state.version + 1) {
    fail(`ringFloor ${state.ringFloor} out of range for version ${state.version}`)
  }
}

/** §3.8: the host's sockets agree with the members. */
export function checkHostInvariants(
  state: RoomState,
  conns: Iterable<SimConn>,
  lobbyCount: number | null,
): void {
  const live = new Map<string, number>()
  for (const conn of conns) {
    if (!conn.helloDone || conn.pid === null) {
      continue
    }
    const m = state.members[conn.pid]
    if (m?.connected && m.connNo === conn.connNo) {
      live.set(conn.pid, (live.get(conn.pid) ?? 0) + 1)
    }
  }
  for (const [pid, n] of live) {
    if (n > 1) {
      fail(`pid ${pid} has ${n} live sockets`)
    }
  }
  for (const [pid, m] of Object.entries(state.members)) {
    if (m.connected && !live.has(pid)) {
      fail(`member ${pid} is connected without its socket (connNo ${m.connNo})`)
    }
  }
  if (lobbyCount !== null && lobbyCount !== connectedCount(state)) {
    fail(`lobbyCount ${lobbyCount} != connected ${connectedCount(state)}`)
  }
}

/** RQ-S17: versions strictly increase and events carry consecutive seqs. */
export function checkStep(
  prev: RoomState | null,
  input: SessionInput,
  result: ReducerResult,
): void {
  const before = prev?.version ?? 0
  const after = result.state.version
  if (after !== before + result.events.length) {
    fail(`version ${before} → ${after} with ${result.events.length} events (${input.type})`)
  }
  result.events.forEach((ev, i) => {
    if (ev.seq !== before + i + 1) {
      fail(`event seq ${ev.seq} at index ${i} after version ${before}`)
    }
  })
  if (
    result.events.length === 0 &&
    prev !== null &&
    result.state !== prev &&
    input.type === 'command'
  ) {
    // accepted no-ops must not write; rejected commands must leave the state reference-equal
    const ack = result.directives.find((d) => d.type === 'ack')
    if (ack && ack.type === 'ack' && !ack.result.ok) {
      fail('a rejected command changed the state')
    }
  }
}

/** Sorted multiset of every card in the game (hands, field, deck). */
export function cardMultiset(state: RoomState): string[] | null {
  if (state.game === null) {
    return null
  }
  const { core } = state.game
  return [
    ...Object.values(core.players).flatMap((p) => p.hand),
    ...core.field.flat(),
    ...core.deck,
  ].sort()
}

/** Card conservation per round: the multiset seen when a round starts never changes. */
export class CardLedger {
  private round: number | null = null
  private epoch: string | null = null
  private cards: string | null = null

  check(state: RoomState): void {
    const set = cardMultiset(state)
    if (set === null || state.game === null) {
      return
    }
    const key = JSON.stringify(set)
    if (this.round !== state.game.round || this.epoch !== state.epoch) {
      this.round = state.game.round
      this.epoch = state.epoch
      this.cards = key
      if (new Set(set).size !== set.length) {
        fail('duplicate card at deal')
      }
      return
    }
    if (key !== this.cards) {
      fail(`card conservation broken in round ${this.round}`)
    }
  }
}

const CARD_SET = new Set<string>(CARD_IDS)

function collectCards(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (CARD_SET.has(value)) {
      out.push(value)
    }
  } else if (Array.isArray(value)) {
    for (const v of value) {
      collectCards(v, out)
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'deck') {
        fail('a frame contains a deck')
      }
      collectCards(v, out)
    }
  }
}

/**
 * RQ-S16: a frame to `pid` may contain only that pid's own hand, the field, and the cards of the
 * submit it reports — never another hand or the deck.
 */
export function checkFrameLeak(
  conn: SimConn,
  frame: RoomServerFrame,
  rendered: RoomState | null,
): void {
  const found: string[] = []
  collectCards(frame, found)
  if (found.length === 0) {
    return
  }
  if (rendered === null || rendered.game === null || conn.pid === null) {
    fail(`frame ${frame.t} carries cards without a game`)
  }
  const { core } = rendered.game
  const allowed = new Set<string>([...(core.players[conn.pid]?.hand ?? []), ...core.field.flat()])
  if (frame.t === 'evt' && frame.e.type === 'submitted') {
    for (const c of [...frame.e.submit, ...frame.e.factor]) {
      allowed.add(c)
    }
  }
  for (const c of found) {
    if (!allowed.has(c)) {
      fail(`frame ${frame.t} to ${conn.pid} leaks ${c}`)
    }
  }
  const snap: View | undefined =
    frame.t === 'evt' ? frame.snap : frame.t === 'welcome' ? frame.snap : undefined
  if (snap?.game) {
    const own = core.players[conn.pid]?.hand ?? []
    if (JSON.stringify(snap.game.hand) !== JSON.stringify(own)) {
      fail(`frame to ${conn.pid} shows a hand that is not theirs`)
    }
  }
}

/** §12.1: a caught-up client's view equals the server's view for it. */
export function checkClientView(
  pid: string,
  clientView: View | null,
  state: RoomState,
  view: ViewFor,
): void {
  const expected = JSON.stringify(view(state, pid))
  const actual = JSON.stringify(clientView)
  if (expected !== actual) {
    fail(`client ${pid} view diverged:\n  client ${actual}\n  server ${expected}`)
  }
}
