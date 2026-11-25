import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REALTIME_HTTP_TIMEOUT_MS,
  RealtimeHttpError,
  createRoom,
  getRoomInfo,
} from './realtime-http'

const BASE = 'http://rt.test'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    impl(String(input), init ?? {}),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('createRoom', () => {
  it('POSTs /rooms with no-store and a 10 s timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const f = fakeFetch(() => json({ roomId: '1009' }))
    await expect(createRoom({ base: BASE, fetch: f })).resolves.toEqual({ roomId: '1009' })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://rt.test/rooms')
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(timeout).toHaveBeenCalledWith(REALTIME_HTTP_TIMEOUT_MS)
    expect(REALTIME_HTTP_TIMEOUT_MS).toBe(10_000)
  })

  it('throws on an HTTP error status', async () => {
    const f = fakeFetch(() => json({ error: 'nope' }, 503))
    const err = await createRoom({ base: BASE, fetch: f }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RealtimeHttpError)
    expect((err as RealtimeHttpError).status).toBe(503)
  })

  it('throws when the request times out', async () => {
    const f = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const err = await createRoom({ base: BASE, fetch: f, timeoutMs: 5 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RealtimeHttpError)
    expect((err as Error).message).toMatch(/timed out/)
  })

  it('throws on a network failure', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(createRoom({ base: BASE, fetch: f })).rejects.toThrow(/POST \/rooms failed/)
  })

  it.each([
    ['missing roomId', {}],
    ['non-string roomId', { roomId: 1009 }],
    ['roomId with bad characters', { roomId: '../etc' }],
    ['empty roomId', { roomId: '' }],
    ['too long roomId', { roomId: 'a'.repeat(33) }],
    ['null body', null],
  ])('throws on %s', async (_label, body) => {
    const f = fakeFetch(() => json(body))
    await expect(createRoom({ base: BASE, fetch: f })).rejects.toThrow(/invalid room id/)
  })

  it('throws on a non-JSON body', async () => {
    const f = fakeFetch(() => new Response('<html>', { status: 200 }))
    await expect(createRoom({ base: BASE, fetch: f })).rejects.toThrow(/invalid JSON/)
  })

  it('throws when no backend is configured', async () => {
    const f = fakeFetch(() => json({ roomId: '2' }))
    await expect(createRoom({ base: null, fetch: f })).rejects.toThrow(/not configured/)
    expect(f).not.toHaveBeenCalled()
  })

  it('uses the configured REALTIME_URL by default', async () => {
    const f = fakeFetch(() => json({ roomId: '2' }))
    await createRoom({ fetch: f })
    expect((f.mock.calls[0] as [string])[0]).toBe('http://127.0.0.1:8787/rooms')
  })
})

describe('getRoomInfo', () => {
  const info = { exists: true, status: 'waiting', members: 2, connected: 1, capacity: 12 }

  it('GETs /rooms/:id and returns the info', async () => {
    const f = fakeFetch(() => json(info))
    await expect(getRoomInfo('1009', { base: BASE, fetch: f })).resolves.toEqual(info)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://rt.test/rooms/1009')
    expect(init.method).toBe('GET')
    expect(init.cache).toBe('no-store')
  })

  it('rejects an invalid id without fetching', async () => {
    const f = fakeFetch(() => json(info))
    await expect(getRoomInfo('a/b', { base: BASE, fetch: f })).rejects.toThrow(/invalid room id/)
    expect(f).not.toHaveBeenCalled()
  })

  it('throws on an unexpected body', async () => {
    const f = fakeFetch(() => json({ exists: 'yes' }))
    await expect(getRoomInfo('7', { base: BASE, fetch: f })).rejects.toThrow(/unexpected body/)
  })

  it('throws on 404', async () => {
    const f = fakeFetch(() => new Response('not found', { status: 404 }))
    await expect(getRoomInfo('7', { base: BASE, fetch: f })).rejects.toMatchObject({ status: 404 })
  })
})
