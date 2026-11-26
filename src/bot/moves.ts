/**
 * Legal plays for the bot, at the rank level (RQ-R12, RQ-R13, RQ-R16, RQ-R17).
 *
 * - Prime plays: a playable number (prime or 57) of the field's card count, above the field.
 * - Composite plays: a composite of the field's card count, above the field, plus a factor
 *   expression spelled with other cards of the hand. Every card of both leaves the hand, so the
 *   expression that uses the most cards is kept.
 *
 * Only numbers of at most `MAX_BOT_CARDS` cards are considered; a longer field is never beaten.
 */
import { type CardId, cardValue } from '../game/cards'
import type { FactCardId } from '../game/types'
import {
  GROTHENDIECK,
  MAX_BOT_CARDS,
  type RankSeq,
  fits,
  giveRanks,
  primePowers,
  rankCounts,
  rankTables,
  spell,
  spellings,
  takeRanks,
} from './ranks'

/** An operator or a rank in a factor expression. */
export type RankToken = number | '*' | '^'

export type RankPlay = {
  ranks: readonly number[]
  /** empty for a prime play */
  factor: readonly RankToken[]
  value: number
  /** cards that leave the hand */
  shed: number
  cut57: boolean
}

export type PlayContext = {
  hand: readonly CardId[]
  /** the top set of the field, or null when the field is empty (the player leads) */
  top: readonly CardId[] | null
  maxSubmitNumCards: number
}

/** Card counts the context allows, and the value to beat (0 when leading). */
function shape(ctx: PlayContext): { sizes: number[]; floor: number } {
  if (ctx.top !== null) {
    const k = ctx.top.length
    if (k > MAX_BOT_CARDS || k > ctx.hand.length) {
      return { sizes: [], floor: 0 }
    }
    return { sizes: [k], floor: spell(ctx.top.map(cardValue)) }
  }
  const max = Math.min(MAX_BOT_CARDS, ctx.maxSubmitNumCards, ctx.hand.length)
  return { sizes: Array.from({ length: max }, (_, i) => i + 1), floor: 0 }
}

/** First index in an ascending `seqs` whose value is above `floor`. */
function firstAbove(seqs: readonly RankSeq[], floor: number): number {
  let lo = 0
  let hi = seqs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (seqs[mid].value <= floor) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/** Every prime (or 57) play the hand can make, ascending by card count then value. */
export function primePlays(ctx: PlayContext, counts = rankCounts(ctx.hand)): RankPlay[] {
  const { sizes, floor } = shape(ctx)
  const { playable } = rankTables()
  const out: RankPlay[] = []
  for (const k of sizes) {
    const seqs = playable[k]
    for (let i = firstAbove(seqs, floor); i < seqs.length; i += 1) {
      const { ranks, value } = seqs[i]
      if (fits(counts, ranks)) {
        out.push({ ranks, factor: [], value, shed: k, cut57: value === GROTHENDIECK })
      }
    }
  }
  return out
}

/** Integer partitions of `n`, parts descending: 3 → [[3], [2, 1], [1, 1, 1]]. */
function partitions(n: number, max = n): number[][] {
  if (n === 0) {
    return [[]]
  }
  const out: number[][] = []
  for (let part = Math.min(n, max); part >= 1; part -= 1) {
    for (const rest of partitions(n - part, part)) {
      out.push([part, ...rest])
    }
  }
  return out
}

type Term = { base: number; exp: number }

/** Every way to group a factorization into terms (`p·p`, `p^2`). */
function termLists(powers: readonly [number, number][]): Term[][] {
  let lists: Term[][] = [[]]
  for (const [p, e] of powers) {
    const options = partitions(e).map((parts) => parts.map((exp) => ({ base: p, exp })))
    lists = lists.flatMap((prefix) => options.map((terms) => [...prefix, ...terms]))
  }
  return lists
}

/**
 * Spell every operand from `counts`, disjointly, using as many cards as possible.
 * Returns the ranks per operand, or null when some operand cannot be spelled.
 */
function spellMost(counts: number[], operands: readonly number[]): number[][] | null {
  if (operands.length === 0) {
    return []
  }
  const [first, ...rest] = operands
  let best: number[][] | null = null
  let bestSize = -1
  for (const ranks of spellings(first)) {
    if (!fits(counts, ranks)) {
      continue
    }
    takeRanks(counts, ranks)
    const tail = spellMost(counts, rest)
    giveRanks(counts, ranks)
    if (tail !== null) {
      const size = ranks.length + tail.reduce((n, r) => n + r.length, 0)
      if (size > bestSize) {
        best = [ranks, ...tail]
        bestSize = size
      }
    }
  }
  return best
}

/** The factor expression for `value` from `counts` that uses the most cards, or null. */
export function bestExpression(counts: number[], value: number): RankToken[] | null {
  let best: RankToken[] | null = null
  let bestCards = -1
  for (const terms of termLists(primePowers(value))) {
    if (terms.length === 1 && terms[0].exp === 1) {
      continue
    }
    const operands = terms.flatMap(({ base, exp }) => (exp === 1 ? [base] : [base, exp]))
    const spelled = spellMost(counts, operands)
    if (spelled === null) {
      continue
    }
    const cards = spelled.reduce((n, r) => n + r.length, 0)
    if (cards <= bestCards) {
      continue
    }
    const tokens: RankToken[] = []
    let i = 0
    terms.forEach(({ exp }, t) => {
      if (t > 0) {
        tokens.push('*')
      }
      tokens.push(...spelled[i++])
      if (exp !== 1) {
        tokens.push('^', ...spelled[i++])
      }
    })
    best = tokens
    bestCards = cards
  }
  return best
}

/** Every composite play the hand can make (one expression per composite spelling). */
export function compositePlays(ctx: PlayContext, counts = rankCounts(ctx.hand)): RankPlay[] {
  const { sizes, floor } = shape(ctx)
  const { composite } = rankTables()
  const out: RankPlay[] = []
  const tried = new Set<string>()
  for (const k of sizes) {
    if (k >= ctx.hand.length) {
      continue
    }
    const seqs = composite[k]
    for (let i = firstAbove(seqs, floor); i < seqs.length; i += 1) {
      const { ranks, value } = seqs[i]
      if (!fits(counts, ranks)) {
        continue
      }
      const key = ranks.join(',')
      if (tried.has(key)) {
        continue
      }
      tried.add(key)
      takeRanks(counts, ranks)
      const factor = bestExpression(counts, value)
      giveRanks(counts, ranks)
      if (factor !== null) {
        const used = factor.filter((t) => typeof t === 'number').length
        out.push({ ranks, factor, value, shed: k + used, cut57: false })
      }
    }
  }
  return out
}

/** Concrete cards for a rank-level play, drawn from `hand`. */
export function toCards(
  hand: readonly CardId[],
  play: Pick<RankPlay, 'ranks' | 'factor'>,
): { submit: CardId[]; factor: FactCardId[] } {
  const pool = new Map<number, CardId[]>()
  for (const card of hand) {
    const v = cardValue(card)
    pool.set(v, [...(pool.get(v) ?? []), card])
  }
  const takeCard = (rank: number): CardId => {
    const card = pool.get(rank)?.shift()
    if (card === undefined) {
      throw new Error(`bot: no card of rank ${rank}`)
    }
    return card
  }
  const submit = play.ranks.map(takeCard)
  const factor = play.factor.map((t) => (typeof t === 'number' ? takeCard(t) : t))
  return { submit, factor }
}
