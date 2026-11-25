import { CLOSE, type Hello } from '@/shared/protocol'
import { DEFAULT_RULE } from '@/shared/rule-options'
import { roomTransportControl } from '@/test-mocks/room-transport'
import { frames, makeView, makeViewMember } from '@/test-utils'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionTransition } from './types'
import {
  ACK_TIMEOUT_MS,
  type KeyValueStorage,
  RoomSessionController,
  RoomTransportContext,
  SEQ_STORAGE_PREFIX,
  UPGRADE_RELOAD_KEY,
  createDisconnectedSession,
  useRoomSession,
} from './use-room-session'

const RT = 'http://127.0.0.1:8787'
const SID = 'A'.repeat(43)

function mount(roomId = '1009', realtimeUrl: string | null = RT) {
  return renderHook(
    ({ id }) => useRoomSession(id, { transportFactory: roomTransportControl.factory, realtimeUrl }),
    { initialProps: { id: roomId } },
  )
}

const t = () => roomTransportControl.last()

/** Open the socket and deliver a welcome (snapshot of the default playing view by default). */
function connect(welcome = frames.welcome()) {
  act(() => t().__open())
  act(() => t().__emit(welcome))
}

const hellos = () =>
  t()
    .sent()
    .filter((f): f is Hello => (f as Hello).t === 'hello')

beforeEach(() => {
  roomTransportControl.reset()
  sessionStorage.clear()
  document.cookie = 'name=alice; path=/'
  document.cookie = `pd_sid=${SID}; path=/`
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useRoomSession: connection lifecycle', () => {
  it('opens the room socket and maps connecting → waiting-sync → open', () => {
    const { result } = mount()
    expect(t().url).toBe('ws://127.0.0.1:8787/rooms/1009/ws')
    expect(result.current.connection).toBe('connecting')
    expect(result.current.selfId).toBeNull()
    expect(result.current.rule).toEqual(DEFAULT_RULE)

    act(() => t().__open())
    expect(result.current.connection).toBe('waiting-sync')
    expect(hellos()).toEqual([
      { t: 'hello', pv: 1, sid: SID, name: 'alice', lastSeq: null, epoch: null },
    ])

    act(() =>
      t().__emit(
        frames.welcome({
          snap: makeView({
            version: 4,
            members: [
              makeViewMember({ id: 'p1', name: 'alice' }),
              makeViewMember({ id: 'p2', name: 'bob', ready: false, connected: false }),
            ],
          }),
        }),
      ),
    )
    const s = result.current
    expect(s.connection).toBe('open')
    expect(s.selfId).toBe('p1')
    expect(s.version).toBe(4)
    expect(s.roomStatus).toBe('playing')
    expect(s.presence).toEqual([
      { id: 'p1', name: 'alice', status: 'ready', role: 'player', connected: true },
      { id: 'p2', name: 'bob', status: 'not-ready', role: 'player', connected: false },
    ])
    expect(s.game?.gameState.players.p1.hand).toEqual(['AS', '3H', 'JD'])
    expect(s.game?.gameState.players.p2.hand).toEqual([])
  })

  it('is error with no backend URL, and its actions report disconnected', async () => {
    const { result } = mount('1009', null)
    expect(result.current.connection).toBe('error')
    expect(roomTransportControl.transports).toHaveLength(0)
    await expect(result.current.actions.setReady()).resolves.toEqual({
      ok: false,
      reason: 'disconnected',
    })
    act(() => result.current.actions.reconnect())
    expect(roomTransportControl.transports).toHaveLength(0)
    await act(() => result.current.actions.leave())
  })

  it('keeps the board while reconnecting and replays from lastSeq', () => {
    const { result } = mount()
    connect(frames.welcome({ snap: makeView({ version: 3 }) }))
    const board = result.current.game
    act(() => t().__close(1006))
    expect(result.current.connection).toBe('connecting')
    expect(result.current.game).toBe(board)

    act(() => t().__open())
    expect(result.current.connection).toBe('waiting-sync')
    expect(hellos().at(-1)).toMatchObject({ lastSeq: 3, epoch: 'epoch-1' })

    const seen: SessionTransition[] = []
    result.current.subscribe((tr) => seen.push(tr))
    act(() => t().__emit(frames.welcome({ mode: 'replay', seq: 4 })))
    act(() => t().__emit(frames.evt({ type: 'drew', by: 'p2' }, { seq: 4 })))
    expect(result.current.connection).toBe('open')
    expect(seen.map((x) => x.msg)).toEqual([
      { action: 'draw', commander: { id: 'p2', name: 'player2' } },
    ])
  })

  it('shows error after repeated failures before the first welcome', () => {
    const { result } = mount()
    act(() => t().__close(1006))
    act(() => t().__close(1006))
    expect(result.current.connection).toBe('connecting')
    act(() => t().__close(1006))
    expect(result.current.connection).toBe('error')
    act(() => t().__open())
    expect(result.current.connection).toBe('waiting-sync')
    act(() => t().__emit(frames.welcome()))
    expect(result.current.connection).toBe('open')
    // after a welcome, drops are plain reconnects again
    for (let i = 0; i < 5; i += 1) {
      act(() => t().__close(1006))
    }
    expect(result.current.connection).toBe('connecting')
  })

  it('a superseded bye is terminal until reconnect()', () => {
    const { result } = mount()
    connect()
    act(() => t().__emit(frames.bye('superseded')))
    expect(result.current.connection).toBe('closed')
    expect(result.current.closeReason).toBe('superseded')
    act(() => t().__close(CLOSE.superseded))
    expect(result.current.connection).toBe('closed')
    expect(result.current.closeReason).toBe('superseded')
    expect(result.current.game).not.toBeNull()

    act(() => result.current.actions.reconnect())
    expect(result.current.connection).toBe('connecting')
    expect(result.current.closeReason).toBeNull()
    expect(t().urls).toHaveLength(2)
    connect(frames.welcome({ mode: 'current', seq: 1 }))
    expect(result.current.connection).toBe('open')
  })

  it.each([
    [CLOSE['room-gone'], 'room-gone'],
    [CLOSE['room-full'], 'room-full'],
    [CLOSE.left, 'left'],
  ] as const)('a terminal close %i without bye maps to %s', (code, reason) => {
    const { result } = mount()
    connect()
    act(() => t().__close(code))
    expect(result.current.connection).toBe('closed')
    expect(result.current.closeReason).toBe(reason)
  })

  it('a protocol bye shows error', () => {
    const { result } = mount()
    connect()
    act(() => t().__emit(frames.bye('protocol')))
    act(() => t().__close(CLOSE.protocol))
    expect(result.current.connection).toBe('error')
    expect(result.current.closeReason).toBeNull()
  })

  it('ignores non-JSON, invalid and lobby frames', () => {
    const { result } = mount()
    connect()
    const before = result.current
    act(() => t().__emit('garbage'))
    act(() => t().__emit({ t: 'evt', seq: 'x' }))
    act(() => t().__emit({ t: 'lobby', lobby: 1, room: {} }))
    expect(result.current).toBe(before)
  })

  it('a current welcome with nothing in memory reconnects for a snapshot', () => {
    sessionStorage.setItem(`${SEQ_STORAGE_PREFIX}1009`, JSON.stringify({ epoch: 'e', lastSeq: 0 }))
    const { result } = mount()
    act(() => t().__open())
    // lastSeq 0 cannot be lowered: the hello asks for a snapshot
    expect(hellos().at(-1)).toMatchObject({ lastSeq: null, epoch: null })
    act(() => t().__emit(frames.welcome({ mode: 'current', seq: 0, epoch: 'e' })))
    expect(t().urls).toHaveLength(2)
    connect()
    expect(result.current.game).not.toBeNull()
  })

  it('closes the transport on unmount and fails pending commands', async () => {
    const { result, unmount } = mount()
    connect()
    const pending = result.current.actions.setReady()
    unmount()
    expect(t().closed).toBe(true)
    await expect(pending).resolves.toEqual({ ok: false, reason: 'disconnected' })
  })

  it('reconnects to a new room when the id changes', () => {
    const { rerender } = mount('1009')
    rerender({ id: '1013' })
    expect(roomTransportControl.transports).toHaveLength(2)
    expect(roomTransportControl.transports[0].closed).toBe(true)
    expect(t().url).toBe('ws://127.0.0.1:8787/rooms/1013/ws')
  })

  it('takes the transport factory from context', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RoomTransportContext.Provider value={roomTransportControl.factory}>
        {children}
      </RoomTransportContext.Provider>
    )
    renderHook(() => useRoomSession('7', { realtimeUrl: 'https://rt.example.com' }), { wrapper })
    expect(t().url).toBe('wss://rt.example.com/rooms/7/ws')
  })
})

describe('useRoomSession: resume across reloads (sessionStorage)', () => {
  it('stores epoch and lastSeq per room and asks for a replay on the next load', () => {
    const first = mount()
    connect(frames.welcome({ snap: makeView({ version: 7 }) }))
    act(() => t().__emit(frames.evt({ type: 'presence' }, { seq: 8 })))
    expect(JSON.parse(sessionStorage.getItem(`${SEQ_STORAGE_PREFIX}1009`) ?? '')).toEqual({
      epoch: 'epoch-1',
      lastSeq: 8,
    })
    first.unmount()

    const { result } = mount()
    act(() => t().__open())
    // no board in memory: one event earlier, so the replay carries a full view
    expect(hellos().at(-1)).toMatchObject({ lastSeq: 7, epoch: 'epoch-1' })
    const seen: SessionTransition[] = []
    result.current.subscribe((tr) => seen.push(tr))
    act(() => t().__emit(frames.welcome({ mode: 'replay', seq: 8 })))
    act(() => t().__emit(frames.evt({ type: 'drew', by: 'p1' }, { seq: 8 })))
    expect(seen.map((x) => x.msg)).toEqual([{ action: 'snapshot' }])
    expect(result.current.game).not.toBeNull()
  })

  it('ignores a corrupt entry', () => {
    sessionStorage.setItem(`${SEQ_STORAGE_PREFIX}1009`, '{bad')
    mount()
    act(() => t().__open())
    expect(hellos().at(-1)).toMatchObject({ lastSeq: null })
    sessionStorage.setItem(`${SEQ_STORAGE_PREFIX}1009`, JSON.stringify({ epoch: 1, lastSeq: -1 }))
    mount()
    act(() => t().__open())
    expect(hellos().at(-1)).toMatchObject({ lastSeq: null })
  })

  it('works when storage throws', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const c = new RoomSessionController({
      roomId: '1',
      url: 'ws://x',
      transportFactory: roomTransportControl.factory,
      storage: throwing,
      getSid: () => SID,
      getName: () => 'alice',
      location: null,
    })
    c.start()
    t().__open()
    t().__emit(frames.welcome())
    expect(c.getSnapshot().connection).toBe('open')
    t().__emit(frames.bye('upgrade-required'))
    expect(c.getSnapshot().closeReason).toBe('upgrade-required')
    c.dispose()
  })
})

describe('useRoomSession: actions and acks', () => {
  it('sends commands with ids and resolves on their ack', async () => {
    const { result } = mount()
    connect(frames.welcome({ snap: makeView({ version: 9, game: { turn: 5 } }) }))
    const a = result.current.actions

    const ready = a.setReady()
    const cmd = t().lastCmd()
    expect(cmd?.c).toEqual({ type: 'ready' })
    expect(cmd?.id.length).toBeLessThanOrEqual(32)
    act(() => t().__emit(frames.ack(cmd?.id ?? '', { seq: 10 })))
    await expect(ready).resolves.toEqual({ ok: true })

    const draw = a.draw()
    expect(t().lastCmd()?.c).toEqual({ type: 'draw', turn: 5 })
    act(() => t().__emit(frames.ack(t().lastCmd()?.id ?? '', { reason: 'stale' })))
    await expect(draw).resolves.toEqual({ ok: false, reason: 'stale' })

    a.pass()
    expect(t().lastCmd()?.c).toEqual({ type: 'pass', turn: 5 })
    a.submit({ submit: ['AS'], factor: [] })
    expect(t().lastCmd()?.c).toEqual({ type: 'submit', turn: 5, submit: ['AS'], factor: [] })
    a.startGame()
    expect(t().lastCmd()?.c).toEqual({ type: 'start', expectedVersion: 9 })
    a.unsetReady()
    expect(t().lastCmd()?.c).toEqual({ type: 'unready' })
    a.changeRule({ timeLimit: 15 })
    expect(t().lastCmd()?.c).toEqual({ type: 'set-rule', rule: { timeLimit: 15 } })

    const ids = t()
      .sent()
      .filter((f) => (f as { t: string }).t === 'cmd')
      .map((f) => (f as { id: string }).id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('turn commands without a game are rejected locally as bad-status', async () => {
    const { result } = mount()
    connect(frames.welcome({ snap: makeView({ game: null }) }))
    await expect(result.current.actions.draw()).resolves.toEqual({
      ok: false,
      reason: 'bad-status',
    })
    expect(t().lastCmd()).toBeUndefined()
  })

  it('commands before the welcome are disconnected', async () => {
    const { result } = mount()
    act(() => t().__open())
    await expect(result.current.actions.setReady()).resolves.toEqual({
      ok: false,
      reason: 'disconnected',
    })
    expect(t().lastCmd()).toBeUndefined()
  })

  it('an unknown ack id is ignored', () => {
    mount()
    connect()
    act(() => t().__emit(frames.ack('nope')))
  })

  it('no ack in 10 s → timeout', async () => {
    vi.useFakeTimers()
    const { result } = mount()
    connect()
    const p = result.current.actions.setReady()
    vi.advanceTimersByTime(ACK_TIMEOUT_MS - 1)
    let settled = false
    p.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    vi.advanceTimersByTime(1)
    await expect(p).resolves.toEqual({ ok: false, reason: 'timeout' })
  })

  it('a socket drop resolves pending commands as disconnected', async () => {
    const { result } = mount()
    connect()
    const p = result.current.actions.pass()
    act(() => t().__close(1006))
    await expect(p).resolves.toEqual({ ok: false, reason: 'disconnected' })
  })

  it('a send that fails resolves disconnected', async () => {
    const { result } = mount()
    connect()
    t().readyState = 0
    await expect(result.current.actions.setReady()).resolves.toEqual({
      ok: false,
      reason: 'disconnected',
    })
  })
})

describe('useRoomSession: leave', () => {
  it('sends leave, waits for the ack, then closes for good', async () => {
    const { result } = mount()
    connect()
    let done = false
    let leaving: Promise<void> = Promise.resolve()
    act(() => {
      leaving = result.current.actions.leave().then(() => {
        done = true
      })
    })
    const cmd = t().lastCmd()
    expect(cmd?.c).toEqual({ type: 'leave' })
    expect(done).toBe(false)
    await act(async () => {
      t().__emit(frames.ack(cmd?.id ?? ''))
      await leaving
    })
    expect(done).toBe(true)
    expect(t().closed).toBe(true)
    expect(result.current.connection).toBe('closed')
    expect(result.current.closeReason).toBe('left')
  })

  it('a bye{left} before the ack also completes the leave', async () => {
    const { result } = mount()
    connect()
    let leaving: Promise<void> = Promise.resolve()
    act(() => {
      leaving = result.current.actions.leave()
    })
    await act(async () => {
      t().__emit(frames.bye('left'))
      await leaving
    })
    expect(result.current.closeReason).toBe('left')
    expect(t().closed).toBe(true)
  })

  it('leaving while not connected just closes', async () => {
    const { result } = mount()
    await act(() => result.current.actions.leave())
    expect(t().closed).toBe(true)
    expect(result.current.connection).toBe('closed')
    // a second leave has no transport left
    await act(() => result.current.actions.leave())
  })
})

describe('useRoomSession: clock', () => {
  it('drives the TurnClock from the deadline and the server offset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { result } = mount()
    // the server clock is 1 h ahead of this device
    const serverNow = 1_000_000 + 3_600_000
    connect(
      frames.welcome({ serverNow, snap: makeView({ game: { deadline: serverNow + 15_000 } }) }),
    )
    expect(result.current.clock.get()).toBe(15)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.clock.get()).toBe(10)
    act(() =>
      t().__emit(
        frames.evt(
          { type: 'game-ended', winnerId: 'p1', winnerName: 'alice', reason: 'empty-hand' },
          {
            seq: 2,
            serverNow: serverNow + 5000,
            snap: makeView({ version: 2, status: 'waitingNextRound', game: { deadline: null } }),
          },
        ),
      ),
    )
    expect(result.current.clock.get()).toBeNull()
  })
})

describe('RoomSessionController: terminal side effects', () => {
  function controller(storage: KeyValueStorage | null = sessionStorage) {
    const location = { pathname: '/room/1009', assign: vi.fn(), reload: vi.fn() }
    const c = new RoomSessionController({
      roomId: '1009',
      url: 'ws://x',
      transportFactory: roomTransportControl.factory,
      storage,
      location,
      getSid: () => SID,
      getName: () => 'x',
    })
    c.start()
    t().__open()
    return { c, location }
  }

  it('bad-name navigates to the login page with a callback', () => {
    const { c, location } = controller()
    t().__emit(frames.bye('bad-name'))
    t().__close(CLOSE['bad-name'])
    expect(location.assign).toHaveBeenCalledTimes(1)
    expect(location.assign).toHaveBeenCalledWith('/login?callback=%2Froom%2F1009')
    expect(c.getSnapshot().closeReason).toBe('bad-name')
  })

  it('upgrade-required reloads once, guarded by sessionStorage', () => {
    const first = controller()
    t().__emit(frames.bye('upgrade-required'))
    expect(first.location.reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(UPGRADE_RELOAD_KEY)).toBe('1')

    const second = controller()
    t().__emit(frames.bye('upgrade-required'))
    expect(second.location.reload).not.toHaveBeenCalled()
    expect(second.c.getSnapshot().connection).toBe('closed')

    // a successful welcome clears the guard for the next deploy
    const third = controller()
    t().__emit(frames.welcome())
    expect(sessionStorage.getItem(UPGRADE_RELOAD_KEY)).toBeNull()
    third.c.dispose()
  })

  it('uses the global location and sessionStorage by default', () => {
    const c = new RoomSessionController({
      roomId: '1',
      url: 'ws://x',
      transportFactory: roomTransportControl.factory,
      getSid: () => SID,
      getName: () => 'x',
    })
    c.start()
    c.start()
    expect(roomTransportControl.transports).toHaveLength(1)
    t().__open()
    t().__emit(frames.welcome())
    expect(sessionStorage.getItem(`${SEQ_STORAGE_PREFIX}1`)).not.toBeNull()
    c.dispose()
  })

  it('subscribe returns an unsubscribe', () => {
    const { c } = controller()
    const seen: unknown[] = []
    const off = c.getSnapshot().subscribe((x) => seen.push(x))
    t().__emit(frames.welcome())
    off()
    t().__emit(frames.evt({ type: 'drew', by: 'p1' }, { seq: 2 }))
    expect(seen).toHaveLength(1)
  })
})

describe('createDisconnectedSession', () => {
  it('is a static disconnected session', async () => {
    const s = createDisconnectedSession()
    expect(s.connection).toBe('connecting')
    await expect(s.actions.draw()).resolves.toEqual({ ok: false, reason: 'disconnected' })
    await expect(s.actions.leave()).resolves.toBeUndefined()
    s.actions.reconnect()
    s.subscribe(() => undefined)()
  })
})
