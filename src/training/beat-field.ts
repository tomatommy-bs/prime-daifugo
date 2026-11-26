/**
 * Mode 2: beat the field. The field holds a `k`-card prime; the player makes a bigger prime
 * (or 57) from exactly `k` cards of the hand, as in a real turn (RQ-R12).
 */
import { FULL_DECK } from '@/game/cards'
import {
  type CardId,
  GROTHENDIECK,
  type Rng,
  cardValue,
  concat,
  deal,
  isPlayable,
  isPrimeSmall,
  permutations,
  pick,
  sortHand,
} from './cards'
import { BEAT_LEVELS, type Level } from './levels'

export type BeatSolution = { value: number; cards: CardId[] }

export type BeatQuestion = {
  k: number
  hand: CardId[]
  field: CardId[]
  fieldValue: number
  /** every playable value that beats the field, largest first, one card layout each */
  solutions: BeatSolution[]
}

const MAX_DEALS = 200

/** Every playable value (prime or 57) that `k` cards of `hand` can form, largest first. */
export function playableFromHand(hand: readonly CardId[], k: number): BeatSolution[] {
  const found = new Map<number, CardId[]>()
  for (const cards of permutations(hand, k)) {
    const value = concat(cards)
    if (!found.has(value) && isPlayable(value)) {
      found.set(value, cards)
    }
  }
  return [...found.entries()].sort(([a], [b]) => b - a).map(([value, cards]) => ({ value, cards }))
}

/** Ranks 1..13 as value strings, for building field numbers rank by rank. */
const RANK_VALUES = Array.from({ length: 13 }, (_, i) => i + 1)

/**
 * Every `k`-card prime (57 excluded: it would have flowed the field) that the cards in `pool`
 * can lay out, with one card layout each.
 */
export function primesFromPool(pool: readonly CardId[], k: number): BeatSolution[] {
  const byRank = new Map<number, CardId[]>()
  for (const card of pool) {
    const v = cardValue(card)
    byRank.set(v, [...(byRank.get(v) ?? []), card])
  }
  const found = new Map<number, CardId[]>()
  const walk = (ranks: number[]) => {
    if (ranks.length === k) {
      const value = Number(ranks.join(''))
      if (value !== GROTHENDIECK && !found.has(value) && isPrimeSmall(value)) {
        const used = new Map<number, number>()
        const cards = ranks.map((r) => {
          const n = used.get(r) ?? 0
          used.set(r, n + 1)
          return (byRank.get(r) as CardId[])[n]
        })
        found.set(value, cards)
      }
      return
    }
    for (const r of RANK_VALUES) {
      const have = byRank.get(r)?.length ?? 0
      const usedSoFar = ranks.filter((x) => x === r).length
      if (usedSoFar < have) {
        walk([...ranks, r])
      }
    }
  }
  walk([])
  return [...found.entries()].sort(([a], [b]) => a - b).map(([value, cards]) => ({ value, cards }))
}

/**
 * A fresh question with at least one answer. The field is usually chosen so that only one or
 * two values beat it, so the player has to find the strong hand rather than any prime.
 */
export function beatQuestion(rng: Rng, level: Level): BeatQuestion {
  const { k, hand: handSize } = BEAT_LEVELS[level]
  for (let attempt = 0; attempt < MAX_DEALS; attempt += 1) {
    const hand = deal(rng, handSize)
    const playable = playableFromHand(hand, k)
    if (playable.length === 0) {
      continue
    }
    const best = playable[0].value
    const handSet = new Set(hand)
    const fields = primesFromPool(
      FULL_DECK.filter((c) => !handSet.has(c)),
      k,
    ).filter((f) => f.value < best)
    if (fields.length === 0) {
      continue
    }
    const beaten = (f: BeatSolution) => playable.filter((s) => s.value > f.value).length
    const tight = fields.filter((f) => beaten(f) <= 2)
    const field = pick(rng, tight.length > 0 && rng.next() < 0.75 ? tight : fields)
    return {
      k,
      hand: sortHand(hand),
      field: field.cards,
      fieldValue: field.value,
      solutions: playable.filter((s) => s.value > field.value),
    }
  }
  throw new Error('beatQuestion: no dealable question')
}

export type BeatVerdict =
  | { ok: true; value: number }
  | { ok: false; reason: 'count' | 'not-prime' | 'too-small'; value: number }

/** Judge an answer the way the engine would (same count, bigger, prime or 57). */
export function judgeBeat(q: BeatQuestion, cards: readonly CardId[]): BeatVerdict {
  const value = concat(cards)
  if (cards.length !== q.k) {
    return { ok: false, reason: 'count', value }
  }
  if (!isPlayable(value)) {
    return { ok: false, reason: 'not-prime', value }
  }
  if (value <= q.fieldValue) {
    return { ok: false, reason: 'too-small', value }
  }
  return { ok: true, value }
}
