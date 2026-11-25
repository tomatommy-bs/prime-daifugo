import { describe, expect, it } from 'vitest'
import { RATE_LIMIT_CAPACITY, RATE_LIMIT_WINDOW_MS, TokenBucket } from '../src/rate-limit'

describe('TokenBucket', () => {
  it('allows 20 commands at once and rejects the 21st', () => {
    const b = new TokenBucket(0)
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      expect(b.take(0)).toBe(true)
    }
    expect(b.take(0)).toBe(false)
    expect(b.take(0)).toBe(false)
  })

  it('refills continuously: one token per 250 ms, capped at capacity', () => {
    const b = new TokenBucket(0)
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      b.take(0)
    }
    const perToken = RATE_LIMIT_WINDOW_MS / RATE_LIMIT_CAPACITY
    expect(b.take(perToken - 1)).toBe(false)
    expect(b.take(perToken)).toBe(true)
    expect(b.take(perToken)).toBe(false)
    // a long idle period refills only up to capacity
    let ok = 0
    while (b.take(1_000_000)) {
      ok += 1
    }
    expect(ok).toBe(RATE_LIMIT_CAPACITY)
  })

  it('sustains 20 per 5 s and ignores a clock going backwards', () => {
    const b = new TokenBucket(0, 4, 1_000)
    for (let i = 0; i < 4; i += 1) {
      b.take(0)
    }
    expect(b.take(-5_000)).toBe(false)
    expect(b.take(250)).toBe(true)
  })
})
