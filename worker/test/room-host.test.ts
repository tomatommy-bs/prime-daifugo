import { describe, expect, it } from 'vitest'
import { ENGINE_IS_STUB, engine } from '../../src/game/engine'
import { REDUCER_IS_STUB, roomReduce } from '../../src/session/reducer'
import type { RoomReducer, RoomState } from '../../src/session/types'
import { viewFor } from '../../src/session/view'
import { PV } from '../../src/shared/ids'
import { MAX_FRAME_BYTES } from '../../src/shared/protocol'
import { mulberry32 } from '../../src/shared/rng'
import {
  LOBBY_REPORT_INTERVAL_MS,
  STALE_CLOSE_CODE,
  STALE_SOCKET_MS,
  SWEEP_INTERVAL_MS,
} from '../src/config'
import { derivePid } from '../src/crypto'
import { RoomHost } from '../src/room-host'
import { MemoryStorage } from '../src/storage'
import {
  FakeClock,
  FakeRegistry,
  FakeSocket,
  RecordingLobby,
  TEST_CONFIG,
  fakeViewFor,
  freshState,
  makeFakeReducer,
  sid,
} from './fakes'

type SetupOptions = {
  reducer?: RoomReducer
  roomId?: string | null
  storage?: MemoryStorage
  registry?: FakeRegistry
  clock?: FakeClock
  derivePid?: (sid: string) => Promise<string>
  real?: boolean
}

function setup(opts: SetupOptions = {}) {
  const storage = opts.storage ?? new MemoryStorage()
  const log = storage.log
  const registry = opts.registry ?? new FakeRegistry()
  const clock = opts.clock ?? new FakeClock()
  const lobby = new RecordingLobby()
  let epochN = 0
  const host = new RoomHost({
    storage,
    sockets: registry,
    clock,
    reducer: opts.reducer ?? (opts.real ? roomReduce : makeFakeReducer()),
    config: TEST_CONFIG,
    lobby,
    viewFor: opts.real ? viewFor : fakeViewFor,
    engine,
    rng: mulberry32(7),
    newEpoch: () => {
      epochN += 1
      return `epoch-${epochN}`
    },
    ...(opts.derivePid ? { derivePid: opts.derivePid } : {}),
  })
  host.onLoad(opts.roomId === undefined ? '1009' : opts.roomId)

  const open = (label?: string) => {
    const s = registry.add(new FakeSocket(log, label))
    host.onOpen(s)
    return s
  }
  const hello = (
    s: FakeSocket,
    n: number,
    extra: Partial<{ pv: number; name: string; lastSeq: number | null; epoch: string | null }> = {},
  ) =>
    host.onMessage(
      s,
      JSON.stringify({
        t: 'hello',
        pv: PV,
        sid: sid(n),
        name: `user${n}`,
        lastSeq: null,
        epoch: null,
        ...extra,
      }),
    )
  const cmd = (s: FakeSocket, id: string, c: unknown) =>
    host.onMessage(s, JSON.stringify({ t: 'cmd', id, c }))
  /** the client (or network) closed the socket */
  const clientClose = (s: FakeSocket) => {
    s.closedWith = { code: 1006 }
    host.onClose(s)
  }
  const join = async (n: number, extra: Parameters<typeof hello>[2] = {}) => {
    const s = open(`u${n}`)
    await hello(s, n, extra)
    return s
  }
  return { host, storage, log, registry, clock, lobby, open, hello, cmd, clientClose, join }
}

const pidOf = (n: number) => derivePid(sid(n))

describe('RoomHost: hello and welcome', () => {
  it('derives the pid from the sid and welcomes with a snapshot', async () => {
    const t = setup()
    const s = await t.join(1)
    const welcome = s.frames()[0]
    expect(welcome).toMatchObject({
      t: 'welcome',
      pv: PV,
      selfId: await pidOf(1),
      epoch: 'epoch-1',
      mode: 'snapshot',
      seq: 1,
      serverNow: t.clock.now(),
    })
    expect(welcome.snap.roomId).toBe(`1009|for:${await pidOf(1)}|v1`)
    expect(s.attachment).toMatchObject({ pid: await pidOf(1), connNo: 1, name: 'user1' })
    expect(t.host.current?.members[await pidOf(1)]?.connected).toBe(true)
  })

  it('persists the state and ring before the first frame is sent', async () => {
    const t = setup()
    await t.join(1)
    const sock2 = t.open('u2')
    t.log.length = 0
    await t.hello(sock2, 2)
    const firstSend = t.log.findIndex((l) => l.startsWith('send:'))
    const persistAt = t.log.indexOf('persist:2')
    expect(persistAt).toBeGreaterThanOrEqual(0)
    expect(firstSend).toBeGreaterThan(persistAt)
    // the alarm is (re-)armed before anything is sent, too
    const alarmAt = t.log.findIndex((l) => l.startsWith('setAlarm'))
    if (alarmAt >= 0) {
      expect(alarmAt).toBeLessThan(firstSend)
    }
    expect(t.storage.readEvents(1).map((r) => r.seq)).toEqual([1, 2])
  })

  it('broadcasts events to other connected members, rendered per viewer', async () => {
    const t = setup()
    const a = await t.join(1)
    const b = await t.join(2)
    const presence = a.last()
    expect(presence).toMatchObject({ t: 'evt', seq: 2, e: { type: 'presence' } })
    expect(presence.snap.roomId).toBe(`1009|for:${await pidOf(1)}|v2`)
    // b was welcomed in the same result: no duplicate evt for seq 2
    expect(b.frames().map((f) => f.t)).toEqual(['welcome'])

    await t.cmd(b, 'r1', { type: 'ready' })
    expect(b.frames().slice(-2)).toMatchObject([
      { t: 'evt', seq: 3, e: { type: 'ready-changed', ready: true } },
      { t: 'ack', id: 'r1', ok: true, seq: 3 },
    ])
    expect(b.frames()[1].snap.roomId).toContain(`for:${await pidOf(2)}`)
    expect(a.last().snap.roomId).toContain(`for:${await pidOf(1)}`)
  })

  it('does not broadcast to disconnected members', async () => {
    const t = setup()
    const a = await t.join(1)
    const b = await t.join(2)
    t.clientClose(a)
    const before = a.sent.length
    await t.cmd(b, 'r1', { type: 'ready' })
    expect(a.sent.length).toBe(before)
  })

  it('accepts pv-1 and rejects other versions with upgrade-required (4005)', async () => {
    const t = setup()
    const old = t.open()
    await t.hello(old, 1, { pv: PV - 1 })
    expect(old.frames()[0].t).toBe('welcome')

    const future = t.open()
    await t.hello(future, 2, { pv: PV + 1 })
    expect(future.last()).toEqual({ t: 'bye', reason: 'upgrade-required' })
    expect(future.closedWith?.code).toBe(4005)

    // a hello from a future client whose shape no longer parses still gets upgrade-required
    const weird = t.open()
    await t.host.onMessage(weird, JSON.stringify({ t: 'hello', pv: 99, token: 'x' }))
    expect(weird.closedWith?.code).toBe(4005)
  })

  it('relays the reducer bye for a bad name (4003)', async () => {
    const t = setup()
    const s = t.open()
    await t.hello(s, 1, { name: 'x' })
    expect(s.last()).toEqual({ t: 'bye', reason: 'bad-name' })
    expect(s.closedWith?.code).toBe(4003)
  })

  it('relays room-full (4002)', async () => {
    const t = setup({ reducer: makeFakeReducer({ maxMembers: 1 }) })
    await t.join(1)
    const s = t.open()
    await t.hello(s, 2)
    expect(s.closedWith?.code).toBe(4002)
  })

  it('processes frames that arrive while the hello is still hashing, in order', async () => {
    const t = setup()
    const s = t.open()
    const h = t.hello(s, 1)
    const c = t.cmd(s, 'r1', { type: 'ready' })
    await Promise.all([h, c])
    expect(s.frames().map((f) => f.t)).toEqual(['welcome', 'evt', 'ack'])
    expect(s.closedWith).toBeNull()
  })

  it('treats a failing pid derivation as a protocol error', async () => {
    const t = setup({ derivePid: () => Promise.reject(new Error('boom')) })
    const s = t.open()
    await t.hello(s, 1)
    expect(s.closedWith?.code).toBe(4004)
  })

  it('closes a socket that was closed while its hello was hashing without connecting', async () => {
    let release: (pid: string) => void = () => undefined
    const t = setup({
      derivePid: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    const s = t.open()
    const h = t.hello(s, 1)
    t.clientClose(s)
    release('pidpidpidpidpid1')
    await h
    expect(Object.keys(t.host.current?.members ?? {})).toEqual([])
  })
})

describe('RoomHost: protocol violations (4004)', () => {
  it('rejects a command before hello', async () => {
    const t = setup()
    const s = t.open()
    await t.cmd(s, 'x', { type: 'ready' })
    expect(s.last()).toEqual({ t: 'bye', reason: 'protocol' })
    expect(s.closedWith?.code).toBe(4004)
  })

  it('rejects non-JSON, binary, oversized and schema-invalid frames', async () => {
    const t = setup()
    const cases: (string | ArrayBuffer)[] = [
      'not json',
      new ArrayBuffer(4),
      JSON.stringify({ t: 'hello', pad: 'x'.repeat(MAX_FRAME_BYTES) }),
      JSON.stringify({ t: 'cmd', id: 'x', c: { type: 'fly' } }),
    ]
    for (const data of cases) {
      const s = t.open()
      await t.host.onMessage(s, data)
      expect(s.closedWith?.code).toBe(4004)
    }
  })

  it('rejects a second hello and marks the member disconnected', async () => {
    const t = setup()
    const s = await t.join(1)
    await t.hello(s, 1)
    expect(s.closedWith?.code).toBe(4004)
    expect(t.host.current?.members[await pidOf(1)]?.connected).toBe(false)
    // the close event that follows does not feed a second disconnect
    const v = t.host.current?.version
    t.host.onClose(s)
    expect(t.host.current?.version).toBe(v)
  })

  it('ignores frames on a socket it already closed', async () => {
    const t = setup()
    const s = t.open()
    await t.host.onMessage(s, 'garbage')
    const n = s.sent.length
    await t.hello(s, 1)
    expect(s.sent.length).toBe(n)
  })

  it('answers a bare ping with pong', async () => {
    const t = setup()
    const s = t.open()
    await t.host.onMessage(s, 'ping')
    expect(s.sent).toEqual(['pong'])
  })
})

describe('RoomHost: commands', () => {
  it('rate-limits to 20 commands per 5 s with an ack', async () => {
    const t = setup()
    const s = await t.join(1)
    for (let i = 0; i < 20; i += 1) {
      await t.cmd(s, `c${i}`, { type: i % 2 ? 'unready' : 'ready' })
    }
    await t.cmd(s, 'over', { type: 'ready' })
    expect(s.last()).toEqual({ t: 'ack', id: 'over', ok: false, reason: 'rate-limited' })
    t.clock.advance(5_000)
    await t.cmd(s, 'again', { type: 'ready' })
    expect(s.last()).toMatchObject({ t: 'ack', id: 'again', ok: true })
  })

  it('writes nothing for a rejected command', async () => {
    const t = setup()
    const s = await t.join(1)
    t.log.length = 0
    await t.cmd(s, 'bad', { type: 'draw', turn: 0 })
    expect(s.last()).toEqual({ t: 'ack', id: 'bad', ok: false, reason: 'bad-status' })
    expect(t.log.filter((l) => l.startsWith('persist'))).toEqual([])
  })

  it('sends ack then bye{left} with 4000 on leave', async () => {
    const t = setup()
    const s = await t.join(1)
    await t.cmd(s, 'bye', { type: 'leave' })
    expect(s.frames().slice(-2)).toEqual([
      { t: 'ack', id: 'bye', ok: true, seq: 2 },
      { t: 'bye', reason: 'left' },
    ])
    expect(s.closedWith?.code).toBe(4000)
  })
})

describe('RoomHost: reconnect, replay and supersede', () => {
  it('replays missed ring events rendered per viewer from their stored post-state', async () => {
    const t = setup()
    const a = await t.join(1)
    const b = await t.join(2)
    const welcome = a.frames()[0]
    const lastSeq = a.last().seq as number // 2
    t.clientClose(a) // seq 3 presence
    await t.cmd(b, 'r1', { type: 'ready' }) // seq 4
    await t.cmd(b, 'r2', { type: 'unready' }) // seq 5

    const a2 = await t.join(1, { lastSeq, epoch: welcome.epoch }) // seq 6 presence
    const frames = a2.frames()
    expect(frames[0]).toMatchObject({ t: 'welcome', mode: 'replay', seq: 6 })
    expect(frames[0].snap).toBeUndefined()
    expect(frames.slice(1).map((f) => f.seq)).toEqual([3, 4, 5, 6])
    const pa = await pidOf(1)
    expect(frames.slice(1).map((f) => f.snap.roomId)).toEqual([
      `1009|for:${pa}|v3`,
      `1009|for:${pa}|v4`,
      `1009|for:${pa}|v5`,
      `1009|for:${pa}|v6`,
    ])
    expect(frames.slice(1).map((f) => f.e.type)).toEqual([
      'presence',
      'ready-changed',
      'ready-changed',
      'presence',
    ])
    // same pid, next connNo
    expect(a2.attachment.connNo).toBe(2)
  })

  it('falls back to a snapshot when the ring no longer covers the gap', async () => {
    const t = setup()
    const a = await t.join(1)
    await t.join(2)
    t.clientClose(a)
    t.storage.events.delete(3)
    const a2 = await t.join(1, { lastSeq: 2, epoch: 'epoch-1' })
    expect(a2.frames()).toHaveLength(1)
    expect(a2.frames()[0]).toMatchObject({ mode: 'snapshot', seq: 4 })
    expect(a2.frames()[0].snap.version).toBe(4)
  })

  it('sends a bare welcome in current mode', async () => {
    const t = setup({
      reducer: (s, input, deps) => {
        const r = makeFakeReducer()(s, input, deps)
        return input.type === 'connect'
          ? {
              ...r,
              directives: r.directives.map((d) =>
                d.type === 'welcome' ? { ...d, mode: 'current' as const } : d,
              ),
            }
          : r
      },
    })
    const s = await t.join(1)
    expect(s.frames()).toEqual([expect.objectContaining({ t: 'welcome', mode: 'current', seq: 1 })])
    expect(s.frames()[0].snap).toBeUndefined()
  })

  it('supersedes the old socket of the same pid with 4001 (newest wins)', async () => {
    const t = setup()
    const first = await t.join(1)
    const second = await t.join(1)
    expect(first.last()).toEqual({ t: 'bye', reason: 'superseded' })
    expect(first.closedWith?.code).toBe(4001)
    expect(second.closedWith).toBeNull()
    expect(second.attachment.connNo).toBe(2)
    // the superseded socket's close event is stale (connNo 1) and changes nothing
    const member = t.host.current?.members[await pidOf(1)]
    t.host.onClose(first)
    expect(t.host.current?.members[await pidOf(1)]).toEqual(member)
    expect(member?.connected).toBe(true)
  })

  it('a client close marks the member disconnected, keeping it as a member', async () => {
    const t = setup()
    const a = await t.join(1)
    t.clientClose(a)
    const m = t.host.current?.members[await pidOf(1)]
    expect(m?.connected).toBe(false)
    expect(m?.graceUntil).toBe(t.clock.now() + TEST_CONFIG.graceIdleMs)
  })
})

describe('RoomHost: load and reconcile (RQ-S19)', () => {
  async function storedRoom(connected: boolean): Promise<{ storage: MemoryStorage; pid: string }> {
    const pid = await pidOf(1)
    const state: RoomState = {
      ...freshState('1009', 'epoch-stored'),
      version: 5,
      ringFloor: 1,
      members: {
        [pid]: {
          name: 'user1',
          joinedAt: 0,
          ready: true,
          readyAt: 1,
          role: 'observer',
          connected,
          connNo: 3,
          lastSeen: 0,
          graceUntil: connected ? null : 1_700_000_000_000 + 30_000,
        },
      },
    }
    const storage = new MemoryStorage()
    storage.persist(state, [], 1)
    storage.log.length = 0
    return { storage, pid }
  }

  it('disconnects members with no live socket and persists once', async () => {
    const { storage, pid } = await storedRoom(true)
    const t = setup({ storage, roomId: null })
    const m = t.host.current?.members[pid]
    expect(m?.connected).toBe(false)
    expect(m?.graceUntil).toBe(t.clock.now() + TEST_CONFIG.graceIdleMs)
    expect(t.host.current?.epoch).toBe('epoch-stored')
    expect(storage.log.filter((l) => l.startsWith('persist'))).toEqual(['persist:6'])
    expect(storage.alarm).toBe(m?.graceUntil)
    // the lobby hears the (now zero) count after every load
    expect(t.lobby.calls).toEqual([{ op: 'report', roomId: '1009', count: 0, status: 'waiting' }])
  })

  it('keeps members whose socket is still attached (hibernation wake)', async () => {
    const { storage, pid } = await storedRoom(true)
    const registry = new FakeRegistry()
    const live = registry.add(new FakeSocket())
    live.attachment = { pid, connNo: 3, name: 'user1', acceptedAt: 0, lastMessageAt: 0 }
    const t = setup({ storage, registry, roomId: null })
    expect(t.host.current?.members[pid]?.connected).toBe(true)
    expect(storage.log.filter((l) => l.startsWith('persist'))).toEqual([])
    expect(t.lobby.calls).toEqual([{ op: 'report', roomId: '1009', count: 1, status: 'waiting' }])
  })

  it('writes nothing when reconcile changes nothing', async () => {
    const { storage } = await storedRoom(false)
    setup({ storage, roomId: null })
    expect(storage.log.filter((l) => l.startsWith('persist'))).toEqual([])
  })

  it('starts fresh on an unknown schema', () => {
    const storage = new MemoryStorage()
    storage.stateJson = JSON.stringify({ schema: 99, roomId: '1009' })
    const t = setup({ storage, roomId: '1009' })
    expect(storage.log).toContain('deleteAll')
    expect(t.host.current?.schema).toBe(1)
    expect(t.host.current?.epoch).toBe('epoch-1')
  })

  it('stays empty without a stored state or room id, and drops a leftover alarm', () => {
    const storage = new MemoryStorage()
    storage.alarm = 123
    const t = setup({ storage, roomId: null })
    expect(t.host.current).toBeNull()
    expect(storage.alarm).toBeNull()
    t.host.onAlarm()
    expect(t.host.info().exists).toBe(false)
  })

  it('closes a hello with room-gone when no state exists', async () => {
    const t = setup({ roomId: null })
    const s = t.open()
    await t.hello(s, 1)
    expect(s.closedWith?.code).toBe(4006)
  })
})

describe('RoomHost: alarm scheduling', () => {
  it('sets the alarm only when the wake time changes', async () => {
    const t = setup({ reducer: makeFakeReducer({ fixedWakeAt: 1_700_000_500_000 }) })
    // the sweep (now + 60 s) is earlier than the reducer wake time once a socket is attached
    const s = await t.join(1)
    const ops = t.storage.alarmOps.length
    for (let i = 0; i < 5; i += 1) {
      await t.cmd(s, `c${i}`, { type: i % 2 ? 'unready' : 'ready' })
    }
    expect(t.storage.alarmOps.length).toBe(ops)
    expect(t.storage.alarm).toBe(t.clock.now() + SWEEP_INTERVAL_MS - 0)
  })

  it('uses the reducer wake time when no socket is attached and deletes it when null', () => {
    let wake: number | null = 1_700_000_100_000
    const t = setup({
      reducer: (s, input, deps) => ({ ...makeFakeReducer()(s, input, deps), wakeAt: wake }),
    })
    t.host.onAlarm()
    expect(t.storage.alarm).toBe(1_700_000_100_000)
    const n = t.storage.alarmOps.length
    t.host.onAlarm()
    // the alarm fired (cleared) and was re-armed to the same time: one write
    expect(t.storage.alarmOps.length).toBe(n + 1)
    wake = null
    t.host.onAlarm()
    expect(t.storage.alarm).toBeNull()
  })

  it('arms a hello deadline and closes silent sockets with 4004', () => {
    const t = setup()
    const s = t.open()
    expect(t.storage.alarm).toBe(t.clock.now() + TEST_CONFIG.helloTimeoutMs)
    t.clock.advance(TEST_CONFIG.helloTimeoutMs - 1)
    t.host.onAlarm()
    expect(s.closedWith).toBeNull()
    t.clock.advance(1)
    t.host.onAlarm()
    expect(s.last()).toEqual({ t: 'bye', reason: 'protocol' })
    expect(s.closedWith?.code).toBe(4004)
    // nothing attached any more: no alarm
    expect(t.storage.alarm).toBeNull()
  })

  it('ticks the reducer on every alarm (grace expiry)', async () => {
    const t = setup()
    const a = await t.join(1)
    const b = await t.join(2)
    t.clientClose(a)
    t.clock.advance(TEST_CONFIG.graceIdleMs)
    t.host.onAlarm()
    expect(t.host.current?.members[await pidOf(1)]).toBeUndefined()
    expect(b.last()).toMatchObject({ t: 'evt', e: { type: 'member-left' } })
  })
})

describe('RoomHost: sweep', () => {
  it('closes sockets silent for more than 75 s and feeds a disconnect', async () => {
    const t = setup()
    const a = await t.join(1)
    const b = await t.join(2)
    t.clock.advance(SWEEP_INTERVAL_MS)
    t.host.onAlarm()
    // 60 s of silence is still fine
    expect(a.closedWith).toBeNull()
    // b keeps answering pings through the runtime auto-response
    t.clock.advance(SWEEP_INTERVAL_MS)
    b.autoAt = t.clock.now() - 1_000
    expect(t.clock.now() - a.attachment.lastMessageAt).toBeGreaterThan(STALE_SOCKET_MS)
    t.host.onAlarm()
    expect(a.closedWith?.code).toBe(STALE_CLOSE_CODE)
    expect(b.closedWith).toBeNull()
    expect(t.host.current?.members[await pidOf(1)]?.connected).toBe(false)
    expect(t.host.current?.members[await pidOf(2)]?.connected).toBe(true)
    // the runtime's close event for a swept socket is ignored
    const v = t.host.current?.version
    t.host.onClose(a)
    expect(t.host.current?.version).toBe(v)
  })

  it('re-reports the lobby count every 5 minutes while members are connected', async () => {
    const t = setup()
    await t.join(1)
    const s = t.registry.sockets[0]
    const reports = () => t.lobby.calls.filter((c) => c.op === 'report' && c.count === 1).length
    expect(reports()).toBe(1)
    for (let i = 0; i < 5; i += 1) {
      t.clock.advance(SWEEP_INTERVAL_MS)
      s.autoAt = t.clock.now()
      t.host.onAlarm()
    }
    expect(reports()).toBe(2)
    expect(LOBBY_REPORT_INTERVAL_MS).toBe(5 * SWEEP_INTERVAL_MS)
  })
})

describe('RoomHost: lobby and GC', () => {
  it('reports the connected count when it changes', async () => {
    const t = setup()
    t.lobby.calls.length = 0
    const a = await t.join(1)
    await t.join(2)
    await t.cmd(a, 'r', { type: 'ready' })
    t.clientClose(a)
    expect(t.lobby.calls.map((c) => (c.op === 'report' ? c.count : -1))).toEqual([1, 2, 1])
  })

  it('destroys the room at gcAt: room-gone, wipe, release, new epoch', async () => {
    const t = setup()
    const a = await t.join(1)
    const watcher = t.open() // a socket that never said hello
    t.clientClose(a)
    expect(t.host.current?.gcAt).toBe(t.clock.now() + TEST_CONFIG.roomTtlIdleMs)
    t.clock.advance(TEST_CONFIG.roomTtlIdleMs)
    t.host.onAlarm()
    expect(watcher.last()).toEqual({ t: 'bye', reason: 'room-gone' })
    expect(watcher.closedWith?.code).toBe(4006)
    expect(t.storage.log).toContain('deleteAll')
    expect(t.storage.stateJson).toBeNull()
    expect(t.lobby.calls.at(-1)).toEqual({ op: 'release', roomId: '1009' })
    expect(t.host.current?.epoch).toBe('epoch-2')
    expect(t.host.info().exists).toBe(false)
    expect(t.storage.alarm).toBeNull()

    // the next connection starts the new epoch
    const b = await t.join(3)
    expect(b.frames()[0]).toMatchObject({ epoch: 'epoch-2', seq: 1 })
  })

  it('info() reports existence, status and counts', async () => {
    const t = setup()
    expect(t.host.info()).toEqual({
      exists: false,
      status: null,
      members: 0,
      connected: 0,
      capacity: 12,
    })
    const a = await t.join(1)
    await t.join(2)
    t.clientClose(a)
    expect(t.host.info()).toEqual({
      exists: true,
      status: 'waiting',
      members: 2,
      connected: 1,
      capacity: 12,
    })
  })
})

describe.skipIf(REDUCER_IS_STUB || ENGINE_IS_STUB)(
  'RoomHost with the real reducer and engine',
  () => {
    it('welcomes, starts a game and never sends another player their cards', async () => {
      const t = setup({ real: true })
      const a = await t.join(1)
      const b = await t.join(2)
      const pa = await pidOf(1)
      const pb = await pidOf(2)
      expect(a.frames()[0]).toMatchObject({ t: 'welcome', mode: 'snapshot', selfId: pa })
      await t.cmd(a, 'ra', { type: 'ready' })
      await t.cmd(b, 'rb', { type: 'ready' })
      const version = t.host.current?.version as number
      await t.cmd(a, 'go', { type: 'start', expectedVersion: version })
      expect(t.host.current?.status).toBe('playing')
      const core = t.host.current?.game?.core
      const handA = core?.players[pa]?.hand ?? []
      const handB = core?.players[pb]?.hand ?? []
      const started = (s: FakeSocket) =>
        s.frames().find((f) => f.t === 'evt' && f.e.type === 'game-started')
      expect(started(a).snap.game.hand).toEqual(handA)
      expect(started(b).snap.game.hand).toEqual(handB)
      for (const card of handB) {
        expect(a.sent.join('\n')).not.toContain(`"${card}"`)
      }
      expect(t.storage.alarm).not.toBeNull()
    })

    it('a reload with the same sid restores the same seat and hand by replay', async () => {
      const t = setup({ real: true })
      const a = await t.join(1)
      const b = await t.join(2)
      await t.cmd(a, 'ra', { type: 'ready' })
      await t.cmd(b, 'rb', { type: 'ready' })
      await t.cmd(a, 'go', { type: 'start', expectedVersion: t.host.current?.version as number })
      const lastSeq = b.last().seq as number
      const epoch = b.frames()[0].epoch as string
      t.clientClose(b)
      const b2 = await t.join(2, { lastSeq, epoch })
      const welcome = b2.frames()[0]
      expect(welcome).toMatchObject({ selfId: await pidOf(2), mode: 'replay' })
      const lastEvt = b2.last()
      expect(lastEvt.snap.game.hand).toEqual(
        t.host.current?.game?.core.players[await pidOf(2)]?.hand,
      )
    })
  },
)
