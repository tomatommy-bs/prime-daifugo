import { initialRoomState } from '../../src/session/reducer'
import {
  DEFAULT_ROOM_CONFIG,
  type Directive,
  type Member,
  type ReducerResult,
  type RoomConfig,
  type RoomReducer,
  type RoomState,
  type ViewFor,
} from '../../src/session/types'
/**
 * Test doubles for the pure Worker hosts (L2h): fake sockets, a fake clock, a recording lobby
 * port and a small fake room reducer with the §3.3-3.6 session semantics the host relies on.
 */
import type { RoomEvent, View } from '../../src/shared/protocol'
import type { Clock, LobbyPort } from '../src/room-host'
import type { HostSocket, HostSocketRegistry, SocketAttachment } from '../src/sockets'
import { freshAttachment } from '../src/sockets'

export class FakeClock implements Clock {
  constructor(public t = 1_700_000_000_000) {}
  now(): number {
    return this.t
  }
  advance(ms: number): void {
    this.t += ms
  }
}

let socketSeq = 0

export class FakeSocket implements HostSocket {
  readonly label: string
  attachment: SocketAttachment = freshAttachment(0)
  readonly sent: string[] = []
  closedWith: { code: number; reason?: string } | null = null
  autoAt: number | null = null

  constructor(
    private readonly log: string[] = [],
    label?: string,
  ) {
    socketSeq += 1
    this.label = label ?? `s${socketSeq}`
  }

  setAttachment(attachment: SocketAttachment): void {
    this.attachment = attachment
  }

  send(text: string): void {
    this.sent.push(text)
    this.log.push(`send:${this.label}`)
  }

  close(code: number, reason?: string): void {
    this.closedWith = { code, reason }
  }

  autoResponseAt(): number | null {
    return this.autoAt
  }

  /** Parsed JSON frames (the bare `pong` is skipped). */
  frames(): any[] {
    return this.sent.filter((t) => t !== 'pong').map((t) => JSON.parse(t))
  }

  last(): any {
    const f = this.frames()
    return f[f.length - 1]
  }
}

export class FakeRegistry implements HostSocketRegistry {
  readonly sockets: FakeSocket[] = []

  add(socket: FakeSocket): FakeSocket {
    this.sockets.push(socket)
    return socket
  }

  /** Like `getWebSockets()` filtered to OPEN: closed sockets disappear. */
  all(): HostSocket[] {
    return this.sockets.filter((s) => s.closedWith === null)
  }
}

export class RecordingLobby implements LobbyPort {
  readonly calls: (
    | { op: 'report'; roomId: string; count: number; status: string }
    | { op: 'release'; roomId: string }
  )[] = []

  report(roomId: string, count: number, status: string): void {
    this.calls.push({ op: 'report', roomId, count, status })
  }

  release(roomId: string): void {
    this.calls.push({ op: 'release', roomId })
  }
}

/** A 43-char sid that passes `SID_RE`. */
export function sid(n: number): string {
  return `sid${String(n).padStart(40, '0')}`
}

/**
 * Fake view: the viewer and the post-state version are encoded in `roomId` so tests can check
 * per-viewer rendering and which stored state a frame was rendered from.
 */
export const fakeViewFor: ViewFor = (state, pid): View => ({
  roomId: `${state.roomId}|for:${pid}|v${state.version}`,
  status: state.status,
  rule: state.rule,
  version: state.version,
  members: Object.entries(state.members)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id, m]) => ({
      id,
      name: m.name,
      ready: m.ready,
      role: m.role,
      connected: m.connected,
    })),
  game: null,
})

const clone = (s: RoomState): RoomState => JSON.parse(JSON.stringify(s))

function connectedCount(s: RoomState): number {
  return Object.values(s.members).filter((m) => m.connected).length
}

function wakeAtOf(s: RoomState): number | null {
  const times = [
    s.gcAt,
    s.game?.deadline ?? null,
    ...Object.values(s.members).map((m) => m.graceUntil),
  ].filter((t): t is number => t !== null)
  return times.length ? Math.min(...times) : null
}

/**
 * A small reducer with the session semantics the host depends on: connect/supersede/room-full/
 * bad-name, welcome modes, disconnect by connNo, grace expiry, GC, reconcile, ready/unready/
 * leave commands. Everything else is rejected with `bad-status`.
 */
export function makeFakeReducer(
  opts: { maxMembers?: number; fixedWakeAt?: number | null } = {},
): RoomReducer {
  const maxMembers = opts.maxMembers ?? 12
  return (input0, input, deps): ReducerResult => {
    const s = clone(input0)
    const events: RoomEvent[] = []
    const directives: Directive[] = []
    const now = deps.now
    const config = deps.config

    const disconnectMember = (m: Member) => {
      m.connected = false
      m.graceUntil = now + config.graceIdleMs
      m.lastSeen = now
      events.push({ type: 'presence' })
    }

    switch (input.type) {
      case 'connect': {
        if (input.name.trim().length < 3) {
          directives.push({
            type: 'bye',
            pid: input.pid,
            connNo: input.connNo,
            reason: 'bad-name',
            code: 4003,
          })
          break
        }
        const existing = s.members[input.pid]
        if (existing) {
          if (existing.connected) {
            directives.push({
              type: 'bye',
              pid: input.pid,
              connNo: existing.connNo,
              reason: 'superseded',
              code: 4001,
            })
          } else {
            events.push({ type: 'presence' })
          }
          existing.connected = true
          existing.connNo = input.connNo
          existing.graceUntil = null
          existing.name = input.name
        } else {
          if (Object.keys(s.members).length >= maxMembers) {
            directives.push({
              type: 'bye',
              pid: input.pid,
              connNo: input.connNo,
              reason: 'room-full',
              code: 4002,
            })
            break
          }
          s.members[input.pid] = {
            name: input.name,
            joinedAt: now,
            ready: false,
            readyAt: null,
            role: 'observer',
            connected: true,
            connNo: input.connNo,
            lastSeen: now,
            graceUntil: null,
          }
          events.push({ type: 'presence' })
        }
        s.gcAt = null
        const finalVersion = s.version + events.length
        const ringFloor = Math.max(1, finalVersion - config.ringSize + 1)
        let mode: 'current' | 'replay' | 'snapshot' = 'snapshot'
        if (input.epoch === s.epoch && input.lastSeq !== null) {
          if (input.lastSeq === finalVersion) {
            mode = 'current'
          } else if (ringFloor <= input.lastSeq + 1 && input.lastSeq + 1 <= finalVersion) {
            mode = 'replay'
          }
        }
        directives.push({
          type: 'welcome',
          pid: input.pid,
          connNo: input.connNo,
          mode,
          fromSeq: mode === 'replay' ? (input.lastSeq as number) + 1 : finalVersion + 1,
        })
        break
      }
      case 'disconnect': {
        const m = s.members[input.pid]
        if (m?.connected && m.connNo === input.connNo) {
          disconnectMember(m)
        }
        break
      }
      case 'reconcile': {
        const live = new Set(input.live.map((c) => `${c.pid}#${c.connNo}`))
        for (const [pid, m] of Object.entries(s.members)) {
          if (m.connected && !live.has(`${pid}#${m.connNo}`)) {
            disconnectMember(m)
          }
        }
        break
      }
      case 'command': {
        const m = s.members[input.pid]
        const ack = (ok: boolean) =>
          directives.push({
            type: 'ack',
            pid: input.pid,
            connNo: input.connNo,
            id: input.id,
            result: ok
              ? { ok: true, seq: s.version + events.length }
              : { ok: false, reason: m ? 'bad-status' : 'not-member' },
          })
        if (!m || m.connNo !== input.connNo) {
          ack(false)
          break
        }
        if (input.cmd.type === 'ready' || input.cmd.type === 'unready') {
          m.ready = input.cmd.type === 'ready'
          m.readyAt = m.ready ? now : null
          events.push({ type: 'ready-changed', by: input.pid, ready: m.ready })
          ack(true)
        } else if (input.cmd.type === 'leave') {
          delete s.members[input.pid]
          events.push({ type: 'member-left', pid: input.pid, name: m.name })
          ack(true)
          directives.push({
            type: 'bye',
            pid: input.pid,
            connNo: input.connNo,
            reason: 'left',
            code: 4000,
          })
        } else {
          ack(false)
        }
        break
      }
      case 'tick': {
        for (const [pid, m] of Object.entries(s.members)) {
          if (m.graceUntil !== null && m.graceUntil <= now) {
            delete s.members[pid]
            events.push({ type: 'member-left', pid, name: m.name })
          }
        }
        if (s.gcAt !== null && s.gcAt <= now) {
          directives.push({ type: 'close', reason: 'room-gone', code: 4006 })
          directives.push({ type: 'destroy' })
          return {
            state: input0,
            events: [],
            directives,
            wakeAt: null,
            lobbyCount: 0,
          }
        }
        break
      }
    }

    if (events.length === 0) {
      return {
        state: input0,
        events: [],
        directives,
        wakeAt: opts.fixedWakeAt !== undefined ? opts.fixedWakeAt : wakeAtOf(input0),
        lobbyCount: connectedCount(input0),
      }
    }
    if (connectedCount(s) === 0 && s.gcAt === null) {
      s.gcAt = now + config.roomTtlIdleMs
    }
    const numbered = events.map((e, i) => ({ seq: s.version + i + 1, e }))
    s.version += events.length
    s.ringFloor = Math.max(1, s.version - config.ringSize + 1)
    return {
      state: s,
      events: numbered,
      directives,
      wakeAt: opts.fixedWakeAt !== undefined ? opts.fixedWakeAt : wakeAtOf(s),
      lobbyCount: connectedCount(s),
    }
  }
}

export function freshState(roomId = '1009', epoch = 'epoch-A', config = DEFAULT_ROOM_CONFIG) {
  return initialRoomState(roomId, epoch, config)
}

export const TEST_CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG }
