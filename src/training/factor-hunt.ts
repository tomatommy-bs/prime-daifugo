/**
 * Mode 3: composite play (合成数出し, RQ-R13, RQ-R16). From one hand, lay out a composite
 * number and a factor expression for it with other cards of the same hand.
 *
 * The solver enumerates composites of up to `maxCards` cards, splits each exponent of the
 * factorization into terms (`p·p·p`, `p²·p`, `p³`), and checks that every operand can be
 * spelled with the cards left (`13` is K or A·3; `113` is A·A·3, A·K or J·3).
 */
import { checkFact, parseFact } from '@/game/factor'
import type { FactCardId } from '@/interface/common'
import {
  type CardId,
  type Rng,
  cardValue,
  concat,
  deal,
  isPrimeSmall,
  permutations,
  primePowers,
  sortHand,
} from './cards'
import { FACTOR_LEVELS, type Level, NO_ANSWER_RATE } from './levels'

/** One way to play: the composite cards and the expression tokens (cards and operators). */
export type FactorPattern = {
  value: number
  composite: CardId[]
  expression: FactCardId[]
  /** canonical text, e.g. `12 = 2^2 * 3`; also the dedupe key */
  key: string
}

/** `patterns` empty: no composite play (解なし). */
export type FactorQuestion = { hand: CardId[]; maxCards: number; patterns: FactorPattern[] }

/** A term `base^exp` of an expression (`exp = 1` when there is no `^`). */
type Term = { base: number; exp: number }

const MAX_DEALS = 300

/** Ways to write `n` as consecutive card values: `113` → `[[1,1,3],[1,13],[11,3]]`. */
export function spellings(n: number): number[][] {
  const memo = new Map<string, number[][]>()
  const go = (s: string): number[][] => {
    if (s === '') {
      return [[]]
    }
    const cached = memo.get(s)
    if (cached) {
      return cached
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
    memo.set(s, out)
    return out
  }
  return go(String(n))
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

/** Every way to group the factorization into terms, terms by base, exponents descending. */
function termLists(powers: readonly [number, number][]): Term[][] {
  let lists: Term[][] = [[]]
  for (const [p, e] of powers) {
    const options = partitions(e).map((parts) => parts.map((exp) => ({ base: p, exp })))
    lists = lists.flatMap((prefix) => options.map((terms) => [...prefix, ...terms]))
  }
  return lists
}

/** Pull one card of each value in `ranks` out of `pool` (mutating), or null if any is missing. */
function take(pool: Map<number, CardId[]>, ranks: readonly number[]): CardId[] | null {
  const taken: CardId[] = []
  for (const r of ranks) {
    const cards = pool.get(r)
    if (!cards || cards.length === 0) {
      giveBack(pool, taken)
      return null
    }
    taken.push(cards.pop() as CardId)
  }
  return taken
}

function giveBack(pool: Map<number, CardId[]>, cards: readonly CardId[]): void {
  for (const card of cards) {
    pool.get(cardValue(card))?.push(card)
  }
}

/** Spell every operand from `pool`, all disjoint. Returns the cards per operand or null. */
function spellAll(pool: Map<number, CardId[]>, operands: readonly number[]): CardId[][] | null {
  if (operands.length === 0) {
    return []
  }
  const [first, ...rest] = operands
  for (const ranks of spellings(first)) {
    const cards = take(pool, ranks)
    if (cards === null) {
      continue
    }
    const tail = spellAll(pool, rest)
    giveBack(pool, cards)
    if (tail !== null) {
      return [cards, ...tail]
    }
  }
  return null
}

const termText = ({ base, exp }: Term) => (exp === 1 ? `${base}` : `${base}^${exp}`)

/**
 * The pattern key of an expression: terms by base ascending, exponents descending, so
 * `3 * 2^2` and `2^2 * 3` name the same play (`12 = 2^2 * 3`).
 */
export function patternKey(value: number, terms: readonly Term[]): string {
  const sorted = [...terms].sort((a, b) => a.base - b.base || b.exp - a.exp)
  return `${value} = ${sorted.map(termText).join(' * ')}`
}

/** Every distinct composite play in `hand` with a composite of at most `maxCards` cards. */
export function findPatterns(hand: readonly CardId[], maxCards: number): FactorPattern[] {
  const found = new Map<string, FactorPattern>()
  const triedComposites = new Set<string>()
  for (let size = 1; size <= Math.min(maxCards, hand.length - 1); size += 1) {
    for (const composite of permutations(hand, size)) {
      const value = concat(composite)
      const spelledAs = composite.map(cardValue).join(',')
      if (value < 4 || isPrimeSmall(value) || triedComposites.has(spelledAs)) {
        continue
      }
      triedComposites.add(spelledAs)
      const used = new Set(composite)
      const pool = new Map<number, CardId[]>()
      for (const card of hand) {
        if (!used.has(card)) {
          const v = cardValue(card)
          pool.set(v, [...(pool.get(v) ?? []), card])
        }
      }
      for (const terms of termLists(primePowers(value))) {
        const key = patternKey(value, terms)
        if (found.has(key)) {
          continue
        }
        // operands in expression order: base, then its exponent when there is one
        const operands = terms.flatMap(({ base, exp }) => (exp === 1 ? [base] : [base, exp]))
        const spelled = spellAll(pool, operands)
        if (spelled === null) {
          continue
        }
        const expression: FactCardId[] = []
        let i = 0
        terms.forEach(({ exp }, t) => {
          if (t > 0) {
            expression.push('*')
          }
          expression.push(...spelled[i++])
          if (exp !== 1) {
            expression.push('^', ...spelled[i++])
          }
        })
        found.set(key, { value, composite, expression, key })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.value - b.value || a.key.localeCompare(b.key))
}

/**
 * A fresh hand. With probability `NO_ANSWER_RATE` it has no composite play (the answer is 解なし);
 * such hands are rare with many cards, so after half the deals the generator settles for a hand
 * with plays.
 */
export function factorQuestion(rng: Rng, level: Level): FactorQuestion {
  const { hand: handSize, maxCards } = FACTOR_LEVELS[level]
  let noAnswer = rng.next() < NO_ANSWER_RATE
  for (let attempt = 0; attempt < MAX_DEALS; attempt += 1) {
    if (attempt === MAX_DEALS / 2) {
      noAnswer = false
    }
    const hand = deal(rng, handSize)
    const patterns = findPatterns(hand, maxCards)
    if (noAnswer ? patterns.length === 0 : patterns.length > 0) {
      return { hand: sortHand(hand), maxCards, patterns }
    }
  }
  throw new Error('factorQuestion: no dealable question')
}

export type FactorVerdict =
  | { ok: true; value: number; key: string }
  | {
      ok: false
      reason: 'no-composite' | 'no-expression' | 'malformed' | 'not-equal' | 'not-prime'
    }

/** Judge an answer with the engine's own factor rules (`src/game/factor.ts`). */
export function judgeFactor(
  composite: readonly CardId[],
  expression: readonly FactCardId[],
): FactorVerdict {
  if (composite.length === 0) {
    return { ok: false, reason: 'no-composite' }
  }
  if (expression.length === 0) {
    return { ok: false, reason: 'no-expression' }
  }
  const parsed = parseFact(expression)
  if (!parsed.ok) {
    return { ok: false, reason: 'malformed' }
  }
  const value = concat(composite)
  const result = checkFact(parsed.terms, BigInt(value))
  if (result === 'INCORRECT_ANSWER') {
    return { ok: false, reason: 'not-equal' }
  }
  if (result === 'FACT_CONTAIN_NOT_PRIME') {
    return { ok: false, reason: 'not-prime' }
  }
  const terms = parsed.terms.map(({ base, exp }) => ({ base: Number(base), exp: Number(exp) }))
  return { ok: true, value, key: patternKey(value, terms) }
}
