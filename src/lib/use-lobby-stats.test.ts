import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOBBY_BACKOFF_MAX_MS,
  type WebSocketCtor,
  lobbyBackoffMs,
  toLobbyCounts,
  useLobbyStats,
} from './use-lobby-stats'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static throwOnConstruct = false

  readonly url: string
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  readonly close = vi.fn()

  constructor(url: string) {
    if (FakeWebSocket.throwOnConstruct) {
      throw new SyntaxError('bad url')
    }
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1)
    if (!ws) {
      throw new Error('no socket')
    }
    return ws
  }

  open() {
    this.onopen?.(new Event('open'))
  }
  message(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
  fail() {
    this.onerror?.(new Event('error'))
    this.onclose?.(new CloseEvent('close', { code: 1006 }))
  }
}

const Ctor = FakeWebSocket as unknown as WebSocketCtor
const URL_ = 'ws://rt.test/lobby'
const frame = (lobby: number, room: Record<string, number>) =>
  JSON.stringify({ t: 'lobby', lobby, room })

describe('toLobbyCounts', () => {
  it('sums rooms and lobby and counts rooms', () => {
    expect(toLobbyCounts({ lobby: 3, room: { a: 2, b: 4 } })).toEqual({
      online: 9,
      lobby: 3,
      rooms: 2,
    })
    expect(toLobbyCounts({ lobby: 0, room: {} })).toEqual({ online: 0, lobby: 0, rooms: 0 })
  })
})

describe('lobbyBackoffMs', () => {
  it('doubles from 1 s and caps at 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(lobbyBackoffMs)).toEqual([
      1000, 2000, 4000, 8000, 10000, 10000, 10000,
    ])
    expect(LOBBY_BACKOFF_MAX_MS).toBe(10_000)
  })
})

describe('useLobbyStats', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    FakeWebSocket.throwOnConstruct = false
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns null until the first frame, then the counts', () => {
    const { result } = renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    expect(result.current).toBeNull()
    expect(FakeWebSocket.last().url).toBe(URL_)
    act(() => FakeWebSocket.last().open())
    expect(result.current).toBeNull()
    act(() => FakeWebSocket.last().message(frame(3, { a: 2, b: 4 })))
    expect(result.current).toEqual({ online: 9, lobby: 3, rooms: 2 })
    act(() => FakeWebSocket.last().message(frame(1, {})))
    expect(result.current).toEqual({ online: 1, lobby: 1, rooms: 0 })
  })

  it('defaults to wsUrl("/lobby")', () => {
    renderHook(() => useLobbyStats({ WebSocketImpl: Ctor }))
    expect(FakeWebSocket.last().url).toBe('ws://127.0.0.1:8787/lobby')
  })

  it('ignores malformed and non-lobby frames', () => {
    const { result } = renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    act(() => {
      const ws = FakeWebSocket.last()
      ws.message('not json')
      ws.message(JSON.stringify({ t: 'lobby', lobby: -1, room: {} }))
      ws.message(JSON.stringify({ lobby: 3, room: {} }))
      ws.message(JSON.stringify({ t: 'bye', reason: 'room-gone' }))
      ws.message(new ArrayBuffer(4))
    })
    expect(result.current).toBeNull()
  })

  it('reconnects silently with a capped backoff and keeps the last counts', () => {
    const log = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    const { result } = renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    act(() => FakeWebSocket.last().message(frame(2, { x: 1 })))

    const delays = [1000, 2000, 4000, 8000, 10000, 10000]
    for (const [i, delay] of delays.entries()) {
      act(() => FakeWebSocket.last().fail())
      expect(FakeWebSocket.instances).toHaveLength(i + 1)
      act(() => vi.advanceTimersByTime(delay - 1))
      expect(FakeWebSocket.instances).toHaveLength(i + 1)
      act(() => vi.advanceTimersByTime(1))
      expect(FakeWebSocket.instances).toHaveLength(i + 2)
    }
    expect(result.current).toEqual({ online: 3, lobby: 2, rooms: 1 })
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('resets the backoff after a successful open', () => {
    renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    act(() => FakeWebSocket.last().fail())
    act(() => vi.advanceTimersByTime(1000))
    act(() => FakeWebSocket.last().fail())
    act(() => vi.advanceTimersByTime(2000))
    expect(FakeWebSocket.instances).toHaveLength(3)
    act(() => {
      FakeWebSocket.last().open()
      FakeWebSocket.last().fail()
    })
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('retries when the constructor throws', () => {
    FakeWebSocket.throwOnConstruct = true
    const log = vi.spyOn(console, 'error')
    renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    expect(FakeWebSocket.instances).toHaveLength(0)
    FakeWebSocket.throwOnConstruct = false
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(log).not.toHaveBeenCalled()
  })

  it('opens no socket without a backend URL', () => {
    const { result } = renderHook(() => useLobbyStats({ url: null, WebSocketImpl: Ctor }))
    act(() => vi.advanceTimersByTime(60_000))
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(result.current).toBeNull()
  })

  it('closes the socket and stops retrying on unmount', () => {
    const { unmount } = renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    const ws = FakeWebSocket.last()
    unmount()
    expect(ws.close).toHaveBeenCalled()
    expect(ws.onclose).toBeNull()
    act(() => vi.advanceTimersByTime(60_000))
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('cancels a pending reconnect on unmount', () => {
    const { unmount } = renderHook(() => useLobbyStats({ url: URL_, WebSocketImpl: Ctor }))
    act(() => FakeWebSocket.last().fail())
    unmount()
    act(() => vi.advanceTimersByTime(60_000))
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
