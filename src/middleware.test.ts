import { SID_COOKIE, SID_RE } from '@/shared/ids'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, middleware } from './middleware'

const VALID_SID = 'A'.repeat(43)

function request(
  path: string,
  cookies: Record<string, string> = {},
  origin = 'http://localhost:3000',
) {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ')
  if (cookieHeader) {
    headers.set('cookie', cookieHeader)
  }
  return new NextRequest(new URL(path, origin), { headers })
}

/** The raw `Set-Cookie` header for `pd_sid`, or undefined. */
function sidSetCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((line) => line.startsWith(`${SID_COOKIE}=`))
}

function sidValue(line: string): string {
  return line.split(';')[0].slice(SID_COOKIE.length + 1)
}

/** Whether `path` is matched by the middleware's single matcher pattern. */
function matches(path: string): boolean {
  const [pattern] = config.matcher as string[]
  return new RegExp(`^${pattern}$`).test(path)
}

describe('middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs on pages and metadata routes, not on build assets or APIs', () => {
    for (const path of ['/', '/rules', '/room/13', '/robots.txt', '/opengraph-image']) {
      expect(matches(path), path).toBe(true)
    }
    for (const path of ['/_next/static/chunks/a.js', '/_next/image', '/api/x']) {
      expect(matches(path), path).toBe(false)
    }
  })

  describe('canonical host', () => {
    const onVercelProduction = () => {
      vi.stubEnv('VERCEL', '1')
      vi.stubEnv('VERCEL_ENV', 'production')
    }

    it('308-redirects a vercel.app alias of production to the same URL on www', () => {
      onVercelProduction()
      const res = middleware(request('/rules?x=1', {}, 'https://prime-daifugo.vercel.app'))
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('https://www.prime-daifugo.jp/rules?x=1')
    })

    it('redirects rooms on the alias before the name gate', () => {
      onVercelProduction()
      const res = middleware(request('/room/13', {}, 'https://prime-daifugo.vercel.app'))
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('https://www.prime-daifugo.jp/room/13')
    })

    it.each(['https://www.prime-daifugo.jp', 'https://prime-daifugo.jp'])(
      'serves %s without redirecting or noindex',
      (origin) => {
        onVercelProduction()
        const res = middleware(request('/rules', {}, origin))
        expect(res.headers.get('location')).toBeNull()
        expect(res.headers.get('x-robots-tag')).toBeNull()
      },
    )

    it('never redirects previews or local servers', () => {
      vi.stubEnv('VERCEL', '1')
      vi.stubEnv('VERCEL_ENV', 'preview')
      expect(
        middleware(request('/', {}, 'https://prime-daifugo-git-x.vercel.app')).headers.get(
          'location',
        ),
      ).toBeNull()
      vi.stubEnv('VERCEL', '')
      vi.stubEnv('VERCEL_ENV', 'production')
      expect(middleware(request('/')).headers.get('location')).toBeNull()
    })
  })

  describe('X-Robots-Tag', () => {
    it('marks every response of a non-production deployment noindex', () => {
      vi.stubEnv('VERCEL_ENV', 'preview')
      expect(middleware(request('/rules')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })

    it('marks rooms noindex on production, redirect and page alike', () => {
      vi.stubEnv('VERCEL', '1')
      vi.stubEnv('VERCEL_ENV', 'production')
      const origin = 'https://www.prime-daifugo.jp'
      const gate = middleware(request('/room/13', {}, origin))
      expect(gate.status).toBe(307)
      expect(gate.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      const room = middleware(request('/room/13', { name: 'alice' }, origin))
      expect(room.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })
  })

  it('leaves non-room pages alone apart from the headers', () => {
    const res = middleware(request('/rules'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(sidSetCookie(res)).toBeUndefined()
  })

  describe('name gate', () => {
    it('redirects to /login with the callback when the name cookie is missing', () => {
      const res = middleware(request('/room/1234'))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location') as string)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('callback')).toBe('/room/1234')
    })

    it.each([
      ['too short', 'a'],
      ['too long', 'abcdefghijk'],
      ['blank after trimming', '   a   '],
    ])('redirects when the name is %s', (_label, name) => {
      const res = middleware(request('/room/new', { name }))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location') as string).searchParams.get('callback')).toBe(
        '/room/new',
      )
    })

    it.each(['ab', 'abc', 'abcdefghij', '  alice  '])('passes %j through', (name) => {
      const res = middleware(request('/room/1234', { name }))
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('x-middleware-next')).toBe('1')
    })
  })

  describe('pd_sid', () => {
    it('issues a sid on the pass-through response when missing', () => {
      const res = middleware(request('/room/1234', { name: 'alice' }))
      const line = sidSetCookie(res)
      expect(line).toBeDefined()
      expect(sidValue(line as string)).toMatch(SID_RE)
      expect(line).toMatch(/Path=\//)
      expect(line).toMatch(/Max-Age=31536000/)
      expect(line).toMatch(/SameSite=lax/i)
      expect(line).not.toMatch(/HttpOnly/i)
      expect(line).not.toMatch(/Secure/i)
    })

    it('issues a sid on the redirect response too', () => {
      const res = middleware(request('/room/1234'))
      expect(res.status).toBe(307)
      const line = sidSetCookie(res)
      expect(line).toBeDefined()
      expect(sidValue(line as string)).toMatch(SID_RE)
    })

    it('marks the cookie Secure on https', () => {
      const res = middleware(
        request('/room/1234', { name: 'alice' }, 'https://prime-daifugo.example'),
      )
      expect(sidSetCookie(res)).toMatch(/Secure/)
    })

    it('keeps a valid sid untouched', () => {
      const cases: Record<string, string>[] = [{ name: 'alice' }, {}]
      for (const cookies of cases) {
        const res = middleware(request('/room/1234', { ...cookies, [SID_COOKIE]: VALID_SID }))
        expect(sidSetCookie(res)).toBeUndefined()
      }
    })

    it('replaces an invalid sid', () => {
      for (const bad of ['short', `${'A'.repeat(42)}!`, 'A'.repeat(44)]) {
        const res = middleware(request('/room/1234', { name: 'alice', [SID_COOKIE]: bad }))
        const line = sidSetCookie(res)
        expect(line).toBeDefined()
        const value = sidValue(line as string)
        expect(value).toMatch(SID_RE)
        expect(value).not.toBe(bad)
      }
    })

    it('issues a different sid per request', () => {
      const a = sidSetCookie(middleware(request('/room/1', { name: 'alice' })))
      const b = sidSetCookie(middleware(request('/room/1', { name: 'alice' })))
      expect(sidValue(a as string)).not.toBe(sidValue(b as string))
    })
  })
})
