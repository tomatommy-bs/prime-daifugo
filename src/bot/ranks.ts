/**
 * Rank-level tables for the bot. A play is decided on card values (ranks 1..13) first and only
 * then mapped onto concrete cards, so the search never depends on the hand size: a 25-card hand
 * costs the same as an 8-card one.
 *
 * Numbers of at most `MAX_BOT_CARDS` cards have at most 8 digits, so `number` arithmetic is exact.
 * Runtime imports are relative only (spec §15): this module runs inside the Worker.
 */
import { type CardId, cardValue } from '../game/cards'

/** The bot never builds numbers of more than this many cards. */
export const MAX_BOT_CARDS = 4

/** Playable as if prime (RQ-R17), though 57 = 3 · 19. */
export const GROTHENDIECK = 57

/** A sequence of ranks laid out side by side, and the number it spells. */
export type RankSeq = { ranks: readonly number[]; value: number }

/** Trial division; exact and fast for n < 10^8. */
export function isPrimeNumber(n: number): boolean {
  if (n < 2) {
    return false
  }
  if (n % 2 === 0) {
    return n === 2
  }
  if (n % 3 === 0) {
    return n === 3
  }
  for (let d = 5; d * d <= n; d += 6) {
    if (n % d === 0 || n % (d + 2) === 0) {
      return false
    }
  }
  return true
}

export const isPlayableNumber = (n: number): boolean => n === GROTHENDIECK || isPrimeNumber(n)

/** Prime factors with multiplicity, ascending: `12 → [[2, 2], [3, 1]]`. */
export function primePowers(n: number): [p: number, e: number][] {
  const out: [number, number][] = []
  let rest = n
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    let e = 0
    while (rest % p === 0) {
      rest /= p
      e += 1
    }
    if (e > 0) {
      out.push([p, e])
    }
  }
  if (rest > 1) {
    out.push([rest, 1])
  }
  return out
}

export const spell = (ranks: readonly number[]): number => Number(ranks.join(''))

type Tables = {
  /** prime or 57, ascending by value, per card count */
  playable: RankSeq[][]
  /** composite (≥ 4, not 57), ascending by value, per card count */
  composite: RankSeq[][]
  /** distinct playable values per card count, ascending (for strength percentiles) */
  playableValues: number[][]
}

let tables: Tables | null = null

/** Every rank sequence of 1..MAX_BOT_CARDS cards, split into playable and composite. Built once. */
export function rankTables(): Tables {
  if (tables !== null) {
    return tables
  }
  const playable: RankSeq[][] = [[]]
  const composite: RankSeq[][] = [[]]
  const playableValues: number[][] = [[]]
  let layer: number[][] = [[]]
  for (let k = 1; k <= MAX_BOT_CARDS; k += 1) {
    layer = layer.flatMap((prefix) => Array.from({ length: 13 }, (_, i) => [...prefix, i + 1]))
    const seqs = layer.map((ranks) => ({ ranks, value: spell(ranks) }))
    seqs.sort((a, b) => a.value - b.value)
    playable[k] = seqs.filter((s) => isPlayableNumber(s.value))
    composite[k] = seqs.filter((s) => s.value >= 4 && !isPlayableNumber(s.value))
    playableValues[k] = [...new Set(playable[k].map((s) => s.value))]
  }
  tables = { playable, composite, playableValues }
  return tables
}

/** How many cards of each rank (index 1..13) a hand holds. */
export function rankCounts(cards: readonly CardId[]): number[] {
  const counts = new Array<number>(14).fill(0)
  for (const card of cards) {
    counts[cardValue(card)] += 1
  }
  return counts
}

/** True when `counts` holds every rank of `ranks` (with multiplicity). Leaves `counts` as it was. */
export function fits(counts: number[], ranks: readonly number[]): boolean {
  let ok = true
  let i = 0
  for (; i < ranks.length; i += 1) {
    counts[ranks[i]] -= 1
    if (counts[ranks[i]] < 0) {
      ok = false
      i += 1
      break
    }
  }
  for (let j = 0; j < i; j += 1) {
    counts[ranks[j]] += 1
  }
  return ok
}

/** Remove `ranks` from `counts` (the caller checked `fits`). */
export function takeRanks(counts: number[], ranks: readonly number[]): void {
  for (const r of ranks) {
    counts[r] -= 1
  }
}

export function giveRanks(counts: number[], ranks: readonly number[]): void {
  for (const r of ranks) {
    counts[r] += 1
  }
}

/** Share of `k`-card playable values below `value`: 0 = weakest, close to 1 = strongest. */
export function strength(value: number, k: number): number {
  const values = rankTables().playableValues[k]
  if (!values || values.length === 0) {
    return 0
  }
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid] < value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo / values.length
}

/** Ways to write `n` as consecutive ranks: `113` → `[[1,1,3],[1,13],[11,3]]`. */
export function spellings(n: number): number[][] {
  const go = (s: string): number[][] => {
    if (s === '') {
      return [[]]
    }
    const out: number[][] = []
    for (const len of [1, 2]) {
      const head = s.slice(0, len)
      if (head.length !== len || head.startsWith('0')) {
        continue
      }
      const v = Number(head)
      if (v < 1 || v > 13) {
        continue
      }
      for (const tail of go(s.slice(len))) {
        out.push([v, ...tail])
      }
    }
    return out
  }
  return go(String(n))
}
