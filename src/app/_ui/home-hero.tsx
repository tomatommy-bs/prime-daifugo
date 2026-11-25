'use client'

import { SieveGrid } from '@/design/SieveGrid'
import { UlamField } from '@/design/UlamField'
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { m } from 'framer-motion'
import { useEffect, useState } from 'react'

/** sessionStorage key: the home intro plays once per browser session (§9.2 #1). */
export const INTRO_KEY = 'introPlayed'

/**
 * - `pending`: SSR and the first client frame, before storage is read (backdrop hidden).
 * - `play`: first visit this session with full motion.
 * - `static`: the final state, drawn at once.
 */
export type IntroState = 'pending' | 'play' | 'static'

const readPlayed = (): boolean => {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === 'true'
  } catch {
    return true
  }
}

const markPlayed = () => {
  try {
    window.sessionStorage.setItem(INTRO_KEY, 'true')
  } catch {
    // storage blocked: the intro simply plays again next time
  }
}

/**
 * Decides once per mount whether the home intro plays. Call it in one place only (the page)
 * and pass the result down, because reading marks the session as played.
 */
export function useHomeIntro({
  enabled = true,
  reduced = false,
}: { enabled?: boolean; reduced?: boolean } = {}): IntroState {
  const mode = useMotionMode()
  const [state, setState] = useState<IntroState>('pending')
  const forceStatic = reduced || mode === 'reduced'

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (forceStatic || readPlayed()) {
      setState('static')
      return
    }
    markPlayed()
    setState('play')
  }, [enabled, forceStatic])

  return forceStatic ? 'static' : state
}

/** A 1px rule that draws from its centre outwards during the intro. */
export function Hairline({ play, delay = 0 }: { play: boolean; delay?: number }) {
  return (
    <m.div
      aria-hidden="true"
      data-hairline=""
      className="h-px w-full"
      style={{ background: 'var(--line)', originX: 0.5 }}
      initial={play ? { scaleX: 0 } : false}
      animate={{ scaleX: 1 }}
      transition={{ duration: DUR.xl, ease: EASE.out, delay }}
    />
  )
}

export type HomeHeroVariant = 'stack' | 'compact' | 'portrait'

export type HomeHeroProps = {
  /** force the static final state (also implied by the OS reduced-motion setting) */
  reduced?: boolean
  /** intro state from `useHomeIntro`; when omitted the hero decides by itself */
  intro?: IntroState
  /** strip geometry: 2 × 50 (stack), 1 × 30 (compact), 2 × 25 (portrait) */
  variant?: HomeHeroVariant
}

const STRIP: Record<HomeHeroVariant, { n: number; cols: number; size: number }> = {
  stack: { n: 100, cols: 50, size: 10 },
  compact: { n: 30, cols: 30, size: 14 },
  portrait: { n: 50, cols: 25, size: 12 },
}

const BACKDROP_SIDE = 55
const BACKDROP_MASK = 'radial-gradient(circle at center, #000 0%, #000 45%, transparent 75%)'

// The four strike-out passes take 4 × (233 + 144) ms; the title lands as the last one ends.
const SIEVE_TOTAL = 4 * (DUR.md + DUR.sm)

/**
 * The home hero (§7.1, §9.2 #1): a SieveGrid strip that strikes out multiples of 2, 3, 5
 * and 7, the title, the subtitle and an Ulam-spiral backdrop.
 *
 * The backdrop is `position: fixed` at `z-index: -10`, so render the hero inside an
 * ancestor with `isolation: isolate` and no transform.
 */
export function HomeHero({ reduced = false, intro, variant = 'stack' }: HomeHeroProps) {
  const own = useHomeIntro({ enabled: intro === undefined, reduced })
  const mode = useMotionMode()
  const state: IntroState = reduced || mode === 'reduced' ? 'static' : (intro ?? own)
  const play = state === 'play'
  const strip = STRIP[variant]
  const titleSize = variant === 'stack' ? 'var(--fs-6)' : 'var(--fs-5)'

  return (
    <header
      className="flex flex-col gap-fib-3"
      data-intro={state}
      data-motion={reduced ? 'reduced' : mode}
    >
      <div
        aria-hidden="true"
        data-hero-backdrop=""
        className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
        style={{
          opacity: state === 'pending' ? 0 : 0.4,
          transition: 'opacity var(--t-lg) var(--ease-out)',
        }}
      >
        {/* Natural cell size (20px), faded to nothing before the square's edge. */}
        <div
          className="shrink-0"
          style={{ maskImage: BACKDROP_MASK, WebkitMaskImage: BACKDROP_MASK }}
        >
          <UlamField side={BACKDROP_SIDE} cell={20} reveal={play} className="block" />
        </div>
      </div>

      <div data-hero-strip={variant}>
        <SieveGrid
          n={strip.n}
          cols={strip.cols}
          size={strip.size}
          animate={play}
          primeOpacity={0.25}
          className="block h-auto w-full"
        />
      </div>

      <m.div
        initial={play ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.lg, ease: EASE.out, delay: play ? SIEVE_TOTAL * 0.5 : 0 }}
      >
        <h1
          className="m-0 font-bold tracking-[0.08em]"
          style={{ fontSize: titleSize, lineHeight: 1.236 }}
        >
          素数大富豪
        </h1>
        <p
          className="m-0 mt-fib-1 text-ink-muted"
          style={{ fontSize: variant === 'stack' ? 'var(--fs-1)' : 'var(--fs-0)' }}
        >
          {/* each half is unbreakable, so a narrow phone wraps before ∀, never inside it */}
          <span lang="ja-Latn" className="whitespace-nowrap">
            Prime Daifugō
            <span aria-hidden="true" className="mx-fib-2">
              ·
            </span>
          </span>{' '}
          <span
            className="num inline-block whitespace-nowrap"
            role="math"
            aria-label="すべての素数 p について p は場より大きい"
          >
            ∀p∈ℙ, p &gt; 場
          </span>
        </p>
      </m.div>

      <Hairline play={play} delay={play ? SIEVE_TOTAL * 0.6 : 0} />
    </header>
  )
}

export default HomeHero
