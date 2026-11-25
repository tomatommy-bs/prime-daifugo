import { describe, expect, it } from 'vitest'
import {
  BROADCAST_INTERVAL_MS,
  EMPTY_ROOM_HOLD_MS,
  LobbyCore,
  RESERVATION_MS,
  STALE_ROW_MS,
} from '../src/lobby-core'
import { MemoryLobbyStorage } from '../src/storage'
import { FakeClock } from './fakes'

class Sock {
  readonly sent: any[] = []
  send(text: string) {
    this.sent.push(JSON.parse(text))
  }
}

function setup() {
  const storage = new MemoryLobbyStorage()
  const clock = new FakeClock()
  const sockets: Sock[] = []
  const core = new LobbyCore(storage, () => sockets, clock)
  const connect = () => {
    const s = new Sock()
    sockets.push(s)
    core.onConnect(s)
    return s
  }
  const disconnect = (s: Sock) => {
    sockets.splice(sockets.indexOf(s), 1)
    core.onDisconnect()
  }
  return { storage, clock, sockets, core, connect, disconnect }
}

const isPrime = (n: number) => {
  if (n < 2) {
    return false
  }
  for (let d = 2; d * d <= n; d += 1) {
    if (n % d === 0) {
      return false
    }
  }
  return true
}

describe('LobbyCore.allocate', () => {
  it('hands out the smallest free primes, each reserved for 10 minutes', () => {
    const t = setup()
    expect(t.core.allocate()).toBe('2')
    expect(t.core.allocate()).toBe('3')
    expect(t.core.allocate()).toBe('5')
    expect(t.storage.getRow('2')).toMatchObject({
      count: 0,
      reservedUntil: t.clock.now() + RESERVATION_MS,
    })
  })

  it('returns 50 distinct primes for 50 sequential calls', () => {
    const t = setup()
    const ids = Array.from({ length: 50 }, () => t.core.allocate())
    expect(new Set(ids).size).toBe(50)
    for (const id of ids) {
      expect(isPrime(Number(id))).toBe(true)
      expect(Number(id)).toBeLessThan(1_000_000)
    }
    expect(ids[49]).toBe('229') // the 50th prime
  })

  it('skips rooms in use and reuses lapsed reservations', () => {
    const t = setup()
    t.core.report('2', 3, 'playing')
    expect(t.core.allocate()).toBe('3')
    t.clock.advance(RESERVATION_MS)
    // 3's reservation lapsed unused; 2 is still in use (and still fresh)
    t.core.report('2', 3, 'playing')
    expect(t.core.allocate()).toBe('3')
  })
})

describe('LobbyCore.report / release', () => {
  it('a count of 0 hides the room but holds its id until GC could have run', () => {
    const t = setup()
    t.core.report('2', 2, 'playing')
    t.core.report('2', 0, 'playing')
    expect(t.core.stats().room).toEqual({})
    // the empty room may still hold a game: never hand it out as a fresh room
    expect(t.core.allocate()).toBe('3')
    t.clock.advance(EMPTY_ROOM_HOLD_MS)
    expect(t.storage.getRow('2')).toMatchObject({ count: 0 })
    expect(t.core.allocate()).toBe('2')
  })

  it('a stale room is hidden at once and its id held', () => {
    const t = setup()
    t.core.report('2', 2, 'playing')
    t.clock.advance(STALE_ROW_MS)
    expect(t.core.stats().room).toEqual({})
    expect(t.core.allocate()).toBe('3')
    t.clock.advance(EMPTY_ROOM_HOLD_MS)
    expect(t.core.allocate()).toBe('2')
  })

  it('a count of 0 keeps a reserved row', () => {
    const t = setup()
    const id = t.core.allocate()
    t.core.report(id, 1, 'waiting')
    t.core.report(id, 0, 'waiting')
    expect(t.storage.getRow(id)).toMatchObject({ count: 0 })
    expect(t.core.allocate()).not.toBe(id)
  })

  it('release deletes the row', () => {
    const t = setup()
    t.core.report('1009', 2, 'playing')
    t.core.release('1009')
    expect(t.core.stats().room).toEqual({})
  })

  it('drops rooms that stopped reporting for 12 minutes', () => {
    const t = setup()
    t.core.report('1009', 2, 'playing')
    t.clock.advance(STALE_ROW_MS - 1)
    t.core.report('11', 1, 'waiting')
    expect(t.core.stats().room).toEqual({ '1009': 2, '11': 1 })
    t.clock.advance(1)
    expect(t.core.stats().room).toEqual({ '11': 1 })
    expect(t.storage.getRow('1009')).toMatchObject({ count: 0 })
  })

  it('a periodic report keeps a room fresh', () => {
    const t = setup()
    t.core.report('1009', 2, 'playing')
    for (let i = 0; i < 5; i += 1) {
      t.clock.advance(5 * 60_000)
      t.core.report('1009', 2, 'playing')
    }
    expect(t.core.stats().room).toEqual({ '1009': 2 })
  })
})

describe('LobbyCore sockets and broadcast', () => {
  it('sends stats to a new socket at once', () => {
    const t = setup()
    t.core.report('1009', 2, 'waiting')
    const s = t.connect()
    expect(s.sent[0]).toEqual({ t: 'lobby', lobby: 1, room: { '1009': 2 } })
  })

  it('broadcasts at most once per second, coalescing through the alarm', () => {
    const t = setup()
    const a = t.connect()
    const before = a.sent.length
    t.clock.advance(BROADCAST_INTERVAL_MS)
    t.core.report('1009', 1, 'waiting') // broadcast now
    t.core.report('1009', 2, 'waiting') // pending
    t.core.report('1009', 3, 'waiting') // pending
    expect(a.sent.length).toBe(before + 1)
    expect(t.storage.alarm).toBe(t.clock.now() + BROADCAST_INTERVAL_MS)

    t.clock.advance(BROADCAST_INTERVAL_MS - 1)
    t.core.onAlarm() // early (or duplicate) alarm: still too soon
    expect(a.sent.length).toBe(before + 1)
    t.clock.advance(1)
    t.core.onAlarm()
    expect(a.sent.length).toBe(before + 2)
    expect(a.sent.at(-1)).toEqual({ t: 'lobby', lobby: 1, room: { '1009': 3 } })
  })

  it('counts sockets and updates others on connect and disconnect', () => {
    const t = setup()
    const a = t.connect()
    t.clock.advance(BROADCAST_INTERVAL_MS)
    const b = t.connect()
    expect(a.sent.at(-1)).toMatchObject({ lobby: 2 })
    expect(b.sent[0]).toMatchObject({ lobby: 2 })
    t.clock.advance(BROADCAST_INTERVAL_MS)
    t.disconnect(b)
    expect(a.sent.at(-1)).toMatchObject({ lobby: 1 })
  })

  it('wakes at the stale cutoff and broadcasts the drop', () => {
    const t = setup()
    const a = t.connect()
    t.core.report('1009', 2, 'playing')
    t.clock.advance(BROADCAST_INTERVAL_MS)
    t.core.onAlarm()
    expect(t.storage.alarm).toBe(t.clock.now() - BROADCAST_INTERVAL_MS + STALE_ROW_MS)
    t.clock.t = t.storage.alarm as number
    t.core.onAlarm()
    expect(a.sent.at(-1)).toEqual({ t: 'lobby', lobby: 1, room: {} })
    expect(t.storage.alarm).toBeNull()
  })

  it('needs no alarm when nothing is pending', () => {
    const t = setup()
    t.core.allocate()
    expect(t.storage.alarm).toBeNull()
    expect(t.core.stats()).toEqual({ t: 'lobby', lobby: 0, room: {} })
  })
})
