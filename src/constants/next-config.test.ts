/**
 * RQ-O2: a production build (`VERCEL_ENV=production`) fails unless `NEXT_PUBLIC_REALTIME_URL`
 * points at a public backend; local and CI builds use the committed default.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

let n = 0
/** A fresh evaluation of next.config.mjs (its guard runs at import time). */
const loadConfig = () => import(/* @vite-ignore */ `../../next.config.mjs?case=${(n += 1)}`)

describe('next.config.mjs production guard (RQ-O2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['unset', ''],
    ['localhost', 'http://localhost:8787'],
    ['127.0.0.1', 'http://127.0.0.1:8787'],
  ])('fails a production build when the URL is %s', async (_, url) => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', url)
    await expect(loadConfig()).rejects.toThrow(/NEXT_PUBLIC_REALTIME_URL/)
  })

  it('accepts a public URL in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', 'https://rt.example.com')
    await expect(loadConfig()).resolves.toBeTruthy()
  })

  it('builds anywhere else with the committed local default', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', 'http://127.0.0.1:8787')
    await expect(loadConfig()).resolves.toBeTruthy()
  })
})
