import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PID_LENGTH, generateSid } from '../../src/shared/ids'
import { derivePid } from '../src/crypto'

const reference = (sid: string) =>
  createHash('sha256').update(`pd:${sid}`).digest('base64url').slice(0, PID_LENGTH)

describe('derivePid', () => {
  it('is base64url(SHA-256("pd:" + sid)).slice(0, 16)', async () => {
    for (let i = 0; i < 20; i += 1) {
      const sid = generateSid()
      expect(await derivePid(sid)).toBe(reference(sid))
    }
  })

  it('is stable, 16 url-safe characters, and differs per sid', async () => {
    const sid = 'A'.repeat(43)
    const pid = await derivePid(sid)
    expect(pid).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(await derivePid(sid)).toBe(pid)
    expect(await derivePid('B'.repeat(43))).not.toBe(pid)
  })

  it('hashes non-ASCII input as UTF-8', async () => {
    expect(await derivePid('ü')).toBe(reference('ü'))
  })
})
