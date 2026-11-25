/**
 * Motion tokens (spec §9.1). Durations are Fibonacci milliseconds expressed in seconds.
 * Springs are described by `visualDuration` and `bounce`.
 */
import { type Transition, type Variants, useReducedMotion } from 'framer-motion'

export const DUR = {
  xs: 0.089,
  sm: 0.144,
  md: 0.233,
  lg: 0.377,
  xl: 0.61,
  xxl: 0.987,
  xxxl: 1.597,
} as const

export type Bezier = readonly [number, number, number, number]

export const EASE = {
  out: [0.22, 1, 0.36, 1], // entrances
  inOut: [0.65, 0, 0.35, 1], // travel
  in: [0.55, 0, 1, 0.45], // exits
} as const satisfies Record<string, Bezier>

export const SPRING = {
  snap: { type: 'spring', visualDuration: 0.233, bounce: 0 }, // UI, pointers
  card: { type: 'spring', visualDuration: 0.377, bounce: 0.15 }, // card layout moves
  soft: { type: 'spring', visualDuration: 0.377, bounce: 0 }, // panels, layout bands
  bounce: { type: 'spring', visualDuration: 0.61, bounce: 0.382 }, // 57, win stamp (1/φ²)
} as const

/** Per-item stagger, compressed so that `stagger(count) * count <= cap`. */
export const stagger = (count: number, base = 0.055, cap = 1.2): number =>
  Math.min(base, cap / Math.max(1, count))

export type DampedShakeOptions = {
  /** amplitude in px */
  A?: number
  /** decay rate (1/s) */
  lambda?: number
  /** angular frequency (rad/s) */
  omega?: number
  /** seconds */
  duration?: number
  /** number of samples (>= 2) */
  n?: number
}

/**
 * Damped sine shake `x(t) = A·e^(−λt)·sin(ωt)`, sampled at `n` points over `duration`.
 * Returns keyframes whose first and last values are exactly 0.
 */
export function dampedShake({
  A = 8,
  lambda = 6,
  omega = 20 * Math.PI,
  duration = 0.377,
  n = 13,
}: DampedShakeOptions = {}): number[] {
  const count = Math.max(2, Math.floor(n))
  const frames: number[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * duration
    const v = A * Math.exp(-lambda * t) * Math.sin(omega * t)
    // round to 1/1000 px to avoid -0 and float noise
    frames.push(Math.round(v * 1000) / 1000 || 0)
  }
  frames[0] = 0
  frames[count - 1] = 0
  return frames
}

/** The decay envelope used by `dampedShake`, exposed for tests and drawings. */
export const shakeEnvelope = (t: number, A = 8, lambda = 6) => A * Math.exp(-lambda * t)

export type DigitMotion = {
  initial: { y: string }
  animate: { y: string }
  exit: { y: string }
  transition: Transition
}

const digit = (dir: 1 | -1): DigitMotion => ({
  initial: { y: `${dir * 100}%` },
  animate: { y: '0%' },
  exit: { y: `${-dir * 100}%` },
  transition: { duration: DUR.md, ease: EASE.out },
})

export const variants = {
  fadeUp: {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: DUR.md, ease: EASE.out } },
  },
  pop: {
    hidden: { opacity: 0, scale: 0.6 },
    show: { opacity: 1, scale: 1, transition: SPRING.bounce },
  },
  seat: {
    hidden: { opacity: 0, scale: 0.6 },
    show: { opacity: 1, scale: 1, transition: SPRING.soft },
    exit: { opacity: 0, scale: 0.6, transition: { duration: DUR.md, ease: EASE.in } },
  },
  drawLine: {
    hidden: { pathLength: 0 },
    show: { pathLength: 1, transition: { duration: DUR.md, ease: EASE.out } },
  },
  digit,
  shake: { x: dampedShake(), transition: { duration: DUR.lg, ease: 'linear' } },
  dissolve: {
    exit: {
      opacity: 0,
      scale: 0.8,
      filter: 'blur(4px)',
      transition: { duration: DUR.lg, ease: EASE.in },
    },
  },
  stamp: {
    hidden: { opacity: 0, scale: 1.4, rotate: -6 },
    show: { opacity: 1, scale: 1, rotate: 0, transition: SPRING.bounce },
  },
  reduced: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: DUR.sm } },
  },
} as const

type VariantName = Exclude<keyof typeof variants, 'digit' | 'shake'>

export type MotionPreset = {
  reduced: boolean
  /** default transition for ad-hoc animations */
  transition: Transition
  /** travel (layout) transition for cards */
  card: Transition
  /** `data-motion` value */
  mode: 'full' | 'reduced'
  fadeUp: Variants
  pop: Variants
  seat: Variants
  drawLine: Variants
  dissolve: Variants
  stamp: Variants
  digit: (dir: 1 | -1) => DigitMotion
  shake: { x: number[]; transition: Transition }
}

const REDUCED_FADE: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.sm } },
  exit: { opacity: 0, transition: { duration: DUR.sm } },
}

/**
 * Maps every named variant to its reduced-motion fallback (§9.4): travel becomes an
 * opacity crossfade of at most 144 ms; shakes are removed.
 */
export function motionPreset(reduced: boolean): MotionPreset {
  if (!reduced) {
    return {
      reduced: false,
      mode: 'full',
      transition: SPRING.snap,
      card: SPRING.card,
      fadeUp: variants.fadeUp,
      pop: variants.pop,
      seat: variants.seat,
      drawLine: variants.drawLine,
      dissolve: variants.dissolve,
      stamp: variants.stamp,
      digit: variants.digit,
      shake: variants.shake,
    }
  }
  const fade: Record<VariantName, Variants> = {
    fadeUp: REDUCED_FADE,
    pop: REDUCED_FADE,
    seat: REDUCED_FADE,
    drawLine: {
      hidden: { pathLength: 1, opacity: 0 },
      show: { pathLength: 1, opacity: 1, transition: { duration: DUR.sm } },
    },
    dissolve: { exit: { opacity: 0, transition: { duration: DUR.sm } } },
    stamp: REDUCED_FADE,
    reduced: variants.reduced,
  }
  return {
    reduced: true,
    mode: 'reduced',
    transition: { duration: DUR.sm },
    card: { duration: DUR.xs },
    fadeUp: fade.fadeUp,
    pop: fade.pop,
    seat: fade.seat,
    drawLine: fade.drawLine,
    dissolve: fade.dissolve,
    stamp: fade.stamp,
    digit: () => ({
      initial: { y: '0%' },
      animate: { y: '0%' },
      exit: { y: '0%' },
      transition: { duration: 0, ease: EASE.out },
    }),
    shake: { x: [0], transition: { duration: 0 } },
  }
}

/** `'full' | 'reduced'` from the OS setting; every animated component writes it to `data-motion`. */
export function useMotionMode(): 'full' | 'reduced' {
  return useReducedMotion() ? 'reduced' : 'full'
}

/** Convenience: the preset matching the viewer's reduced-motion setting. */
export function useMotionPreset(): MotionPreset {
  return motionPreset(useReducedMotion() === true)
}
