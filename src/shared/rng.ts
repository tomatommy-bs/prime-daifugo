/**
 * Randomness for the pure layers (spec §7.1). Production code injects `cryptoRng()`;
 * tests inject a seeded `mulberry32(seed)` so every run is reproducible.
 */
import type { Rng } from '../game/types'

export type { Rng }

/** Seeded PRNG (mulberry32): deterministic sequence in [0, 1) for a given 32-bit seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

const BUFFER_SIZE = 64

/** Crypto-backed Rng in [0, 1) (uses `crypto.getRandomValues`, buffered). */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(BUFFER_SIZE)
  let index = BUFFER_SIZE
  return {
    next() {
      if (index >= BUFFER_SIZE) {
        crypto.getRandomValues(buffer)
        index = 0
      }
      const value = buffer[index]
      index += 1
      return value / 4294967296
    },
  }
}

/** Integer in [0, n) drawn from `rng`. */
export function randomInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng.next() * n))
}

/** Fisher-Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}
