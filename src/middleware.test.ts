import { SID_COOKIE, SID_RE } from '@/shared/ids'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
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

describe('middleware', () => {
  it('matches /room/:path* only', () => {
    expect(config.matcher).toEqual(['/room/:path*'])
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
      ['too short', 'ab'],
      ['too long', 'abcdefghijk'],
      ['blank after trimming', '   ab   '],
    ])('redirects when the name is %s', (_label, name) => {
      const res = middleware(request('/room/new', { name }))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location') as string).searchParams.get('callback')).toBe(
        '/room/new',
      )
    })

    it.each(['abc', 'abcdefghij', '  alice  '])('passes %j through', (name) => {
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
