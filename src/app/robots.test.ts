import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from './robots'

const host = vi.hoisted(() => ({ value: 'www.prime-daifugo.jp' as string | null }))
vi.mock('next/headers', () => ({
  headers: () => new Headers(host.value ? { host: host.value } : {}),
}))

describe('robots.txt route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is open on the production deployment and host', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    host.value = 'www.prime-daifugo.jp'
    expect(robots().rules).toMatchObject({ allow: '/' })
  })

  it('is closed on previews', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    host.value = 'www.prime-daifugo.jp'
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' })
  })

  it('is closed on the vercel.app alias of production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    host.value = 'prime-daifugo.vercel.app'
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' })
  })
})
