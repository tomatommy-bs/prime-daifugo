import { FULL_DECK } from '@/game/cards'
import { isPrime } from '@/game/numbers'
import { mulberry32 } from '@/shared/rng'
import { afterEach, describe, expect, it } from 'vitest'
import { beatQuestion, judgeBeat, playableFromHand, primesFromPool } from './beat-field'
import { concat, isPlayable, isPrimeSmall, permutations, primePowers } from './cards'
import { factorQuestion, findPatterns, judgeFactor, spellings } from './factor-hunt'
import { BEAT_LEVELS, FACTOR_LEVELS, LEVELS, PRIME_CARDS, QUESTIONS_PER_RUN } from './levels'
import { isCorrectPrimeAnswer, primeQuestion } from './prime-quiz'
import { RECORDS_KEY, readBest, saveIfBest } from './records'
import { type RunState, formatMs, isBetter, runReducer, scoreOf } from './session'

describe('cards', () => {
  it('isPrimeSmall agrees with the engine below 20000 and on 8-digit samples', () => {
    for (let n = 0; n < 20000; n += 1) {
      expect(isPrimeSmall(n), String(n)).toBe(isPrime(BigInt(n)))
    }
    for (const n of [13131313, 12131111, 10111213, 99999989, 13121311]) {
      expect(isPrimeSmall(n), String(n)).toBe(isPrime(BigInt(n)))
    }
  })

  it('treats 57 as playable', () => {
    expect(isPlayable(57)).toBe(true)
    expect(isPlayable(51)).toBe(false)
    expect(isPlayable(53)).toBe(true)
  })

  it('factors with multiplicity', () => {
    expect(primePowers(12)).toEqual([
      [2, 2],
      [3, 1],
    ])
    expect(primePowers(1024)).toEqual([[2, 10]])
    expect(primePowers(13)).toEqual([[13, 1]])
  })

  it('concatenates card values', () => {
    expect(concat(['QS', 'AH'])).toBe(121)
    expect(concat(['10S', '3H'])).toBe(103)
  })

  it('permutations has n!/(n-k)! entries', () => {
    expect([...permutations([1, 2, 3, 4], 2)]).toHaveLength(12)
  })
})

describe('mode 1: prime quiz', () => {
  it.each(LEVELS)('%s: uses the level card count and judges correctly', (level) => {
    const rng = mulberry32(1)
    let primes = 0
    for (let i = 0; i < 200; i += 1) {
      const q = primeQuestion(rng, level)
      expect(q.cards).toHaveLength(PRIME_CARDS[level])
      expect(new Set(q.cards).size).toBe(q.cards.length)
      expect(q.value).toBe(concat(q.cards))
      expect(q.prime).toBe(isPrime(BigInt(q.value)))
      expect(isCorrectPrimeAnswer(q, q.prime ? 'prime' : 'composite')).toBe(true)
      primes += q.prime ? 1 : 0
    }
    // about half
    expect(primes).toBeGreaterThan(60)
    expect(primes).toBeLessThan(140)
  })

  it('avoids values already seen', () => {
    const rng = mulberry32(2)
    const seen = new Set<number>()
    for (let i = 0; i < QUESTIONS_PER_RUN; i += 1) {
      const q = primeQuestion(rng, 'easy', seen)
      expect(seen.has(q.value)).toBe(false)
      seen.add(q.value)
    }
  })
})

describe('mode 2: beat the field', () => {
  it('lists playable values from a hand, largest first', () => {
    const solutions = playableFromHand(['5S', '7H', '3C'], 2)
    expect(solutions.map((s) => s.value)).toEqual([73, 57, 53, 37])
  })

  it('primesFromPool skips 57 and respects card counts', () => {
    const values = primesFromPool(['5S', '7S', 'AS'], 2).map((s) => s.value)
    expect(values).toEqual([17, 71])
    // only one 1 in the pool: 11 is not formable
    expect(values).not.toContain(11)
  })

  it.each(LEVELS)('%s: every listed answer is accepted and the list is complete', (level) => {
    const rng = mulberry32(3)
    let none = 0
    for (let i = 0; i < 30; i += 1) {
      const q = beatQuestion(rng, level)
      const { k, hand } = BEAT_LEVELS[level]
      expect(q.hand).toHaveLength(hand)
      expect(q.field).toHaveLength(k)
      expect(isPrime(BigInt(q.fieldValue))).toBe(true)
      expect(q.fieldValue).not.toBe(57)
      // the field is laid out from cards outside the hand
      expect(q.field.some((c) => q.hand.includes(c))).toBe(false)
      if (q.solutions.length === 0) {
        none += 1
      }
      for (const s of q.solutions) {
        expect(judgeBeat(q, s.cards)).toEqual({ ok: true, value: s.value })
      }
      // and the solution list is complete
      const all = playableFromHand(q.hand, k).filter((s) => s.value > q.fieldValue)
      expect(q.solutions.map((s) => s.value)).toEqual(all.map((s) => s.value))
    }
    // some questions are 解なし, most are not
    expect(none).toBeGreaterThan(0)
    expect(none).toBeLessThan(15)
  })

  it('rejects a wrong count, a composite and a smaller prime', () => {
    const q = {
      k: 2,
      hand: ['AS', '3S', '7S', '9S', '2H'],
      field: ['4H', '3H'],
      fieldValue: 43,
      solutions: [],
    } as Parameters<typeof judgeBeat>[0]
    expect(judgeBeat(q, ['7S'])).toMatchObject({ ok: false, reason: 'count' })
    expect(judgeBeat(q, ['9S', 'AS'])).toMatchObject({ ok: false, reason: 'not-prime' })
    expect(judgeBeat(q, ['3S', '7S'])).toMatchObject({ ok: false, reason: 'too-small' })
    expect(judgeBeat(q, ['7S', '3S'])).toEqual({ ok: true, value: 73 })
  })
})

describe('mode 3: composite play', () => {
  it('spells numbers as card values', () => {
    expect(spellings(113)).toEqual([
      [1, 1, 3],
      [1, 13],
      [11, 3],
    ])
    expect(spellings(103)).toEqual([[10, 3]])
    expect(spellings(5)).toEqual([[5]])
  })

  it('finds 6 = 2 * 3 and 8 = 2^3 in a small hand', () => {
    const keys = findPatterns(['6S', '2S', '3S', '8H'], 1).map((p) => p.key)
    expect(keys).toContain('6 = 2 * 3')
    expect(keys).toContain('8 = 2^3')
    // 8 = 2 * 2 * 2 needs three 2s
    expect(keys).not.toContain('8 = 2 * 2 * 2')
  })

  it('spells multi-card operands (26 = 2 * 13 with K or A·3)', () => {
    const withAce = findPatterns(['2S', '6S', '2H', 'AS', '3S'], 2).map((p) => p.key)
    expect(withAce).toContain('26 = 2 * 13')
  })

  it.each(LEVELS)('%s: every pattern beats the field and passes the engine judge', (level) => {
    const rng = mulberry32(4)
    let none = 0
    for (let i = 0; i < 20; i += 1) {
      const q = factorQuestion(rng, level)
      expect(q.hand).toHaveLength(FACTOR_LEVELS[level].hand)
      expect(FACTOR_LEVELS[level].sizes).toContain(q.k)
      expect(q.field).toHaveLength(q.k)
      expect(q.field.some((c) => q.hand.includes(c))).toBe(false)
      expect(q.fieldValue).not.toBe(57)
      // the list is exactly the k-card plays above the field (empty = 解なし)
      expect(q.patterns.map((p) => p.key)).toEqual(
        findPatterns(q.hand, q.k, q.k)
          .filter((p) => p.value > q.fieldValue)
          .map((p) => p.key),
      )
      if (q.patterns.length === 0) {
        none += 1
      }
      for (const p of q.patterns) {
        expect(judgeFactor(p.composite, p.expression, q)).toEqual({
          ok: true,
          value: p.value,
          key: p.key,
        })
        const used = [...p.composite, ...p.expression.filter((t) => t !== '*' && t !== '^')]
        expect(new Set(used).size).toBe(used.length)
        expect(used.every((c) => q.hand.includes(c as (typeof q.hand)[number]))).toBe(true)
        expect(p.composite).toHaveLength(q.k)
      }
    }
    expect(none).toBeLessThan(10)
  })

  it('checks the field: same card count, bigger number', () => {
    const field = { k: 1, fieldValue: 10 }
    expect(judgeFactor(['QS'], ['2S', '^', '2H', '*', '3S'], field)).toMatchObject({ ok: true })
    expect(judgeFactor(['9S'], ['3S', '^', '2H'], field)).toEqual({
      ok: false,
      reason: 'too-small',
    })
    expect(judgeFactor(['AS', '2S'], ['2S', '^', '2H', '*', '3S'], field)).toEqual({
      ok: false,
      reason: 'count',
    })
  })

  it('reports why an answer fails', () => {
    expect(judgeFactor([], ['2S', '*', '3S'])).toEqual({ ok: false, reason: 'no-composite' })
    expect(judgeFactor(['6S'], [])).toEqual({ ok: false, reason: 'no-expression' })
    expect(judgeFactor(['6S'], ['2S', '*'])).toEqual({ ok: false, reason: 'malformed' })
    expect(judgeFactor(['6S'], ['2S', '*', '5S'])).toEqual({ ok: false, reason: 'not-equal' })
    expect(judgeFactor(['8S'], ['2S', '*', '4S'])).toEqual({ ok: false, reason: 'not-prime' })
    expect(judgeFactor(['QS'], ['3S', '*', '2S', '^', '2H'])).toEqual({
      ok: true,
      value: 12,
      key: '12 = 2^2 * 3',
    })
  })

  it('handles every single card of the deck without throwing', () => {
    expect(() => findPatterns(FULL_DECK.slice(0, 13), 1)).not.toThrow()
  })
})

describe('session', () => {
  const start = (): RunState<string> =>
    runReducer({ phase: 'ready' }, { type: 'start', question: 'q0', now: 1000 })

  it('times only the open question and ends after the last one', () => {
    let s = start()
    for (let i = 0; i < QUESTIONS_PER_RUN; i += 1) {
      s = runReducer(s, { type: 'answer', correct: i % 2 === 0, now: 1000 + i * 10000 + 2000 })
      expect(s.phase).toBe('feedback')
      s = runReducer(s, { type: 'next', question: `q${i + 1}`, now: 1000 + (i + 1) * 10000 })
    }
    expect(s.phase).toBe('done')
    const score = scoreOf(s.phase === 'done' ? s.results : [])
    expect(score).toEqual({ correct: 5, total: 10, ms: 20000 })
  })

  it('ignores answers outside a question', () => {
    const s = start()
    const answered = runReducer(s, { type: 'answer', correct: true, now: 2000 })
    expect(runReducer(answered, { type: 'answer', correct: false, now: 3000 })).toBe(answered)
  })

  it('ranks by correct answers, then time', () => {
    expect(isBetter({ correct: 9, total: 10, ms: 50000 }, { correct: 8, total: 10, ms: 1 })).toBe(
      true,
    )
    expect(isBetter({ correct: 8, total: 10, ms: 2 }, { correct: 8, total: 10, ms: 1 })).toBe(false)
    expect(isBetter({ correct: 0, total: 10, ms: 2 }, null)).toBe(true)
  })

  it('formats times', () => {
    expect(formatMs(9050)).toBe('9.0')
    expect(formatMs(83450)).toBe('1:23.4')
    expect(formatMs(60000)).toBe('1:00.0')
  })
})

describe('records', () => {
  afterEach(() => window.localStorage.clear())

  it('keeps only the best run', () => {
    const at = new Date('2026-11-26T00:00:00Z')
    expect(readBest('prime', 'easy')).toBeNull()
    expect(saveIfBest('prime', 'easy', { correct: 7, total: 10, ms: 30000 }, at)).toBe(true)
    expect(saveIfBest('prime', 'easy', { correct: 6, total: 10, ms: 1000 }, at)).toBe(false)
    expect(saveIfBest('prime', 'easy', { correct: 7, total: 10, ms: 20000 }, at)).toBe(true)
    expect(readBest('prime', 'easy')).toMatchObject({ correct: 7, ms: 20000 })
    expect(readBest('prime', 'hard')).toBeNull()
  })

  it('survives malformed storage', () => {
    window.localStorage.setItem(RECORDS_KEY, '{oops')
    expect(readBest('beat', 'easy')).toBeNull()
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify({ 'beat:easy': { correct: 'x' } }))
    expect(readBest('beat', 'easy')).toBeNull()
  })
})
