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

/** Share of 素数づくり / 合成数出し questions that have no answer (the right reply is 解なし). */
export const NO_ANSWER_RATE = 0.2

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

/**
 * Mode 3: composite play. `hand` cards dealt; the field holds a number of one of `sizes` cards,
 * and the composite must have as many cards and be bigger.
 */
export const FACTOR_LEVELS: Record<Level, { hand: number; sizes: readonly number[] }> = {
  easy: { hand: 6, sizes: [1, 2] },
  normal: { hand: 8, sizes: [2, 3] },
  hard: { hand: 10, sizes: [3, 4] },
}

const sizesText = (sizes: readonly number[]) => `${sizes[0]}〜${sizes[sizes.length - 1]}`

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
    summary: '場より大きな合成数と、その素因数分解の式を手札からつくります。',
    levels: {
      easy: `場 ${sizesText(FACTOR_LEVELS.easy.sizes)} 枚・手札 ${FACTOR_LEVELS.easy.hand} 枚`,
      normal: `場 ${sizesText(FACTOR_LEVELS.normal.sizes)} 枚・手札 ${FACTOR_LEVELS.normal.hand} 枚`,
      hard: `場 ${sizesText(FACTOR_LEVELS.hard.sizes)} 枚・手札 ${FACTOR_LEVELS.hard.hand} 枚`,
    },
  },
}

export const isLevel = (value: unknown): value is Level =>
  typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
