import { describe, expect, it, vi } from 'vitest'
import {
  type RouterDeps,
  corsHeaders,
  handleRequest,
  isOriginAllowed,
  matchRoute,
} from '../src/http'

const ALLOWED = ['http://localhost:3000', 'https://prime-daifugo-*.vercel.app']

function deps(overrides: Partial<RouterDeps> = {}) {
  const d = {
    allowedOrigins: ALLOWED,
    createRoom: vi.fn(async () => '2'),
    roomInfo: vi.fn(async () => ({
      exists: true,
      status: 'waiting',
      members: 1,
      connected: 1,
      capacity: 12,
    })),
    roomSocket: vi.fn(async (id: string) => new Response(`room:${id}`)),
    lobbySocket: vi.fn(async () => new Response('lobby')),
    ...overrides,
  }
  return d
}

function req(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://rt.test${path}`, { method, headers })
}

const upgrade = (origin?: string) => ({
  upgrade: 'websocket',
  ...(origin ? { origin } : {}),
})

describe('matchRoute', () => {
  it('matches the §8.1 table', () => {
    expect(matchRoute('GET', '/healthz')).toEqual({ ok: true, route: { kind: 'healthz' } })
    expect(matchRoute('HEAD', '/healthz')).toEqual({ ok: true, route: { kind: 'healthz' } })
    expect(matchRoute('GET', '/lobby')).toEqual({ ok: true, route: { kind: 'lobby-ws' } })
    expect(matchRoute('POST', '/rooms')).toEqual({ ok: true, route: { kind: 'create-room' } })
    expect(matchRoute('GET', '/rooms/1009')).toEqual({
      ok: true,
      route: { kind: 'room-info', id: '1009' },
    })
    expect(matchRoute('get', '/rooms/a_B-9/ws')).toEqual({
      ok: true,
      route: { kind: 'room-ws', id: 'a_B-9' },
    })
  })

  it('404s bad room ids and unknown paths', () => {
    for (const path of [
      '/rooms/bad.id',
      `/rooms/${'x'.repeat(33)}`,
      '/rooms/%E0%A4%A',
      '/rooms/%2e%2e',
      '/rooms/1009/ws/extra',
      '/nope',
      '/',
    ]) {
      expect(matchRoute('GET', path)).toEqual({ ok: false, status: 404 })
    }
  })

  it('405s the wrong method', () => {
    expect(matchRoute('GET', '/rooms')).toEqual({ ok: false, status: 405, allow: 'POST' })
    expect(matchRoute('POST', '/rooms/1009')).toEqual({ ok: false, status: 405, allow: 'GET' })
    expect(matchRoute('HEAD', '/lobby')).toEqual({ ok: false, status: 405, allow: 'GET' })
  })
})

describe('isOriginAllowed', () => {
  it('matches exact entries and single-label wildcards', () => {
    expect(isOriginAllowed('http://localhost:3000', ALLOWED)).toBe(true)
    expect(isOriginAllowed('https://prime-daifugo-git-x-1.vercel.app', ALLOWED)).toBe(true)
    expect(isOriginAllowed('http://localhost:3001', ALLOWED)).toBe(false)
    expect(isOriginAllowed('https://prime-daifugo-.vercel.app', ALLOWED)).toBe(false)
    expect(isOriginAllowed('https://prime-daifugo-a.evil.vercel.app', ALLOWED)).toBe(false)
    expect(isOriginAllowed('https://prime-daifugo-a.vercel.app.evil.test', ALLOWED)).toBe(false)
    expect(isOriginAllowed(null, ALLOWED)).toBe(false)
    expect(isOriginAllowed('http://localhost:3000', [])).toBe(false)
  })
})

describe('corsHeaders', () => {
  it('echoes an allowed origin and always varies on Origin', () => {
    const h = corsHeaders('http://localhost:3000', ALLOWED)
    expect(h.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(h.get('access-control-allow-methods')).toContain('POST')
    expect(h.get('vary')).toBe('Origin')
    const none = corsHeaders('http://evil.test', ALLOWED)
    expect(none.get('access-control-allow-origin')).toBeNull()
    expect(none.get('vary')).toBe('Origin')
  })
})

describe('handleRequest', () => {
  it('serves /healthz', async () => {
    const res = await handleRequest(req('GET', '/healthz'), deps())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('404s a bad room id before touching a Durable Object', async () => {
    const d = deps()
    const res = await handleRequest(req('GET', '/rooms/bad!id/ws', upgrade(ALLOWED[0])), d)
    expect(res.status).toBe(404)
    expect(d.roomSocket).not.toHaveBeenCalled()
  })

  it('405s with an Allow header', async () => {
    const res = await handleRequest(req('PUT', '/rooms'), deps())
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('forwards room and lobby upgrades with an allowed Origin', async () => {
    const d = deps()
    const res = await handleRequest(req('GET', '/rooms/1009/ws', upgrade(ALLOWED[0])), d)
    expect(await res.text()).toBe('room:1009')
    expect(d.roomSocket).toHaveBeenCalledWith('1009', expect.any(Request))
    const lobby = await handleRequest(
      req('GET', '/lobby', upgrade('https://prime-daifugo-pr-7.vercel.app')),
      d,
    )
    expect(await lobby.text()).toBe('lobby')
  })

  it('403s upgrades with a foreign or missing Origin', async () => {
    const d = deps()
    for (const headers of [upgrade('http://evil.test'), upgrade()]) {
      expect((await handleRequest(req('GET', '/rooms/1009/ws', headers), d)).status).toBe(403)
      expect((await handleRequest(req('GET', '/lobby', headers), d)).status).toBe(403)
    }
    expect(d.roomSocket).not.toHaveBeenCalled()
    expect(d.lobbySocket).not.toHaveBeenCalled()
  })

  it('426s a socket route without an upgrade header', async () => {
    const res = await handleRequest(req('GET', '/rooms/1009/ws', { origin: ALLOWED[0] }), deps())
    expect(res.status).toBe(426)
  })

  it('POST /rooms returns the allocated id with CORS for an allowed Origin', async () => {
    const res = await handleRequest(req('POST', '/rooms', { origin: ALLOWED[0] }), deps())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ roomId: '2' })
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED[0])
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('allows server-to-server HTTP without an Origin (no CORS headers)', async () => {
    const res = await handleRequest(req('POST', '/rooms'), deps())
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('403s plain HTTP from a foreign Origin', async () => {
    const d = deps()
    const res = await handleRequest(req('POST', '/rooms', { origin: 'http://evil.test' }), d)
    expect(res.status).toBe(403)
    expect(d.createRoom).not.toHaveBeenCalled()
  })

  it('GET /rooms/:id returns the room info', async () => {
    const d = deps()
    const res = await handleRequest(req('GET', '/rooms/1009'), d)
    expect(await res.json()).toEqual({
      exists: true,
      status: 'waiting',
      members: 1,
      connected: 1,
      capacity: 12,
    })
    expect(d.roomInfo).toHaveBeenCalledWith('1009')
  })

  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await handleRequest(req('OPTIONS', '/rooms', { origin: ALLOWED[0] }), deps())
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ALLOWED[0])
    const bad = await handleRequest(
      req('OPTIONS', '/rooms', { origin: 'http://evil.test' }),
      deps(),
    )
    expect(bad.status).toBe(403)
  })

  it('500s when a Durable Object call fails, keeping CORS', async () => {
    const res = await handleRequest(
      req('POST', '/rooms', { origin: ALLOWED[0] }),
      deps({ createRoom: () => Promise.reject(new Error('down')) }),
    )
    expect(res.status).toBe(500)
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED[0])
  })

  it('keeps CORS on a 404 for an allowed Origin', async () => {
    const res = await handleRequest(req('GET', '/nope', { origin: ALLOWED[0] }), deps())
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED[0])
  })
})
