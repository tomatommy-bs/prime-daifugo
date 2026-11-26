/**
 * The three training modes and their difficulty levels.
 */

export const MODES = ['prime', 'beat', 'factor'] as const
export type Mode = (typeof MODES)[number]

export const LEVELS = ['easy', 'normal', 'hard'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABEL: Record<Level, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'むずかしい',
}

/** Questions per run (a 10-question time attack). */
export const QUESTIONS_PER_RUN = 10

export type ModeInfo = {
  mode: Mode
  path: `/training/${Mode}`
  title: string
  /** one line for the hub */
  summary: string
  /** what each level means, shown on the start screen */
  levels: Record<Level, string>
}

/** Mode 1: is this card number prime? Cards per number. */
export const PRIME_CARDS: Record<Level, number> = { easy: 2, normal: 3, hard: 4 }

/** Mode 2: beat the field. `k` cards on the field and in the answer; `hand` cards dealt. */
export const BEAT_LEVELS: Record<Level, { k: number; hand: number }> = {
  easy: { k: 2, hand: 7 },
  normal: { k: 3, hand: 9 },
  hard: { k: 4, hand: 11 },
}

/** Mode 3: composite play. `hand` cards dealt; the solver looks for composites up to `maxCards`. */
export const FACTOR_LEVELS: Record<Level, { hand: number; maxCards: number }> = {
  easy: { hand: 6, maxCards: 2 },
  normal: { hand: 8, maxCards: 3 },
  hard: { hand: 10, maxCards: 4 },
}

export const MODE_INFO: Record<Mode, ModeInfo> = {
  prime: {
    mode: 'prime',
    path: '/training/prime',
    title: '素数判定トレーニング',
    summary: 'カードを並べた数が素数か合成数かを、すばやく見分けます。',
    levels: {
      easy: `${PRIME_CARDS.easy} 枚の数`,
      normal: `${PRIME_CARDS.normal} 枚の数`,
      hard: `${PRIME_CARDS.hard} 枚の数`,
    },
  },
  beat: {
    mode: 'beat',
    path: '/training/beat',
    title: '素数づくりトレーニング',
    summary: '場と同じ枚数で、場より大きな素数を手札からつくります。',
    levels: {
      easy: `場 ${BEAT_LEVELS.easy.k} 枚・手札 ${BEAT_LEVELS.easy.hand} 枚`,
      normal: `場 ${BEAT_LEVELS.normal.k} 枚・手札 ${BEAT_LEVELS.normal.hand} 枚`,
      hard: `場 ${BEAT_LEVELS.hard.k} 枚・手札 ${BEAT_LEVELS.hard.hand} 枚`,
    },
  },
  factor: {
    mode: 'factor',
    path: '/training/factor',
    title: '合成数出しトレーニング',
    summary: '手札から合成数とその素因数分解の式をつくります。',
    levels: {
      easy: `手札 ${FACTOR_LEVELS.easy.hand} 枚`,
      normal: `手札 ${FACTOR_LEVELS.normal.hand} 枚`,
      hard: `手札 ${FACTOR_LEVELS.hard.hand} 枚`,
    },
  },
}

export const isLevel = (value: unknown): value is Level =>
  typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
