/**
 * Per-socket token bucket (spec §3.1): 20 commands per 5 s. Pure; time is passed in.
 */

export const RATE_LIMIT_CAPACITY = 20
export const RATE_LIMIT_WINDOW_MS = 5_000

export class TokenBucket {
  private tokens: number
  private updatedAt: number

  constructor(
    now: number,
    private readonly capacity = RATE_LIMIT_CAPACITY,
    private readonly windowMs = RATE_LIMIT_WINDOW_MS,
  ) {
    this.tokens = capacity
    this.updatedAt = now
  }

  /** Take one token. Returns false (and takes nothing) when the bucket is empty. */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt)
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.capacity) / this.windowMs)
    this.updatedAt = Math.max(this.updatedAt, now)
    if (this.tokens < 1) {
      return false
    }
    this.tokens -= 1
    return true
  }
}
