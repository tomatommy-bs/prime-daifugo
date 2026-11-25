'use client'
/**
 * The 57 cut ceremony (spec §6.3; catalogue §9.2 #25).
 *
 * A gold diagonal slash draws, the field cards (when given) cleave into two halves along it,
 * the caption `57 — グロタンディーク素数切り` pops, then `もう一度` (the same seat plays again).
 * Tap or Esc skips straight to `onDone`. Reduced motion: the gold caption holds 1597 ms.
 */
import { DUR, EASE, SPRING, motionPreset, useMotionMode } from '@/design/motion'
import { type CardId, GameCard } from '@/game-card/src'
import { AnimatePresence, m } from 'framer-motion'
import { useCallback, useEffect, useRef } from 'react'

export type GrothendieckCutProps = {
  active: boolean
  onDone: () => void
  /** tap / Esc skips the ceremony, default true */
  skippable?: boolean
  /** field cards to cleave along the slash (optional; otherwise only the slash plays) */
  cards?: CardId[]
}

export const CUT_CAPTION = '57 — グロタンディーク素数切り'
export const CUT_AGAIN = 'もう一度'
/** total ceremony length (ms): slash 233 → caption → もう一度 → done */
export const CUT_TOTAL_MS = 1597
const AGAIN_AT = DUR.xxl

const HALVES = [
  { clip: 'polygon(0 0, 100% 0, 0 100%)', x: -8, y: -8, rotate: -4 },
  { clip: 'polygon(100% 0, 100% 100%, 0 100%)', x: 8, y: 8, rotate: 4 },
] as const

function Cleave({ cards }: { cards: CardId[] }) {
  return (
    <span
      aria-hidden="true"
      data-cleave=""
      className="absolute inset-0 flex items-center justify-center gap-fib-1"
    >
      {cards.map((card, ci) => (
        <span key={card} className="relative inline-flex" style={{ fontSize: 'var(--card-field)' }}>
          {HALVES.map((h, hi) => (
            <m.span
              // biome-ignore lint/suspicious/noArrayIndexKey: two fixed halves
              key={hi}
              data-half={hi}
              className={hi === 0 ? 'relative inline-flex' : 'absolute inset-0 inline-flex'}
              style={{ clipPath: h.clip }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: h.x, y: h.y, rotate: h.rotate, opacity: [1, 1, 0] }}
              transition={{
                duration: DUR.lg,
                ease: EASE.out,
                delay: DUR.md * 0.6 + ci * 0.034,
                opacity: { duration: DUR.lg, times: [0, 0.5, 1], delay: DUR.md * 0.6 + ci * 0.034 },
              }}
            >
              <GameCard card={card} role="presentation" aria-hidden="true" focusable="false" />
            </m.span>
          ))}
        </span>
      ))}
    </span>
  )
}

export function GrothendieckCut({ active, onDone, skippable = true, cards }: GrothendieckCutProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const preset = motionPreset(!full)
  const fired = useRef(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const finish = useCallback(() => {
    if (fired.current) {
      return
    }
    fired.current = true
    doneRef.current()
  }, [])

  useEffect(() => {
    if (!active) {
      return
    }
    fired.current = false
    const id = setTimeout(finish, CUT_TOTAL_MS)
    return () => clearTimeout(id)
  }, [active, finish])

  useEffect(() => {
    if (!active || !skippable) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, skippable, finish])

  const content = (
    <>
      {full ? (
        <svg
          aria-hidden="true"
          data-slash=""
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <m.line
            x1="8%"
            y1="92%"
            x2="92%"
            y2="8%"
            stroke="var(--gold)"
            strokeWidth={6}
            strokeLinecap="round"
            style={{ filter: 'blur(6px)' }}
            initial={{ pathLength: 0, opacity: 0.6 }}
            animate={{ pathLength: 1, opacity: [0.6, 0.6, 0] }}
            transition={{ duration: DUR.md, ease: EASE.out, opacity: { duration: DUR.xl } }}
          />
          <m.line
            x1="8%"
            y1="92%"
            x2="92%"
            y2="8%"
            stroke="var(--gold)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DUR.md, ease: EASE.out }}
          />
        </svg>
      ) : null}
      {full && cards && cards.length > 0 ? <Cleave cards={cards} /> : null}
      <span
        className="relative flex flex-col items-center gap-fib-1 rounded-[var(--r-3)] px-fib-4 py-fib-2"
        style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}
      >
        <m.span
          aria-hidden="true"
          className="num block font-bold leading-none"
          style={{ fontSize: 'var(--fs-5)', color: 'var(--gold)' }}
          variants={preset.pop}
          initial="hidden"
          animate="show"
          transition={full ? { ...SPRING.bounce, delay: DUR.md } : undefined}
        >
          57
        </m.span>
        <m.span
          data-caption=""
          className="block font-bold"
          style={{ fontSize: 'var(--fs-1)', color: 'var(--gold)' }}
          variants={preset.pop}
          initial="hidden"
          animate="show"
          transition={full ? { ...SPRING.bounce, delay: DUR.md + DUR.xs } : undefined}
        >
          {CUT_CAPTION}
        </m.span>
        <m.span
          data-again=""
          className="mt-fib-1 block rounded-[var(--r-1)] px-fib-2 font-semibold"
          style={{
            fontSize: 'var(--fs--1)',
            color: 'var(--gold)',
            border: '1.5px solid currentColor',
          }}
          initial={full ? { opacity: 0, scale: 0.9 } : false}
          animate={full ? { opacity: 1, scale: [0.9, 1.06, 1] } : { opacity: 1 }}
          transition={
            full ? { duration: DUR.lg, delay: AGAIN_AT, ease: EASE.out } : { duration: 0 }
          }
        >
          {CUT_AGAIN}
        </m.span>
      </span>
    </>
  )

  const shared = {
    'data-grothendieck-cut': '',
    'data-motion': mode,
    className:
      'absolute inset-0 z-20 flex items-center justify-center overflow-hidden border-0 p-0 text-center',
    style: { background: 'color-mix(in srgb, var(--bg) 78%, transparent)' },
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: full ? DUR.md : DUR.sm, ease: EASE.in } },
    transition: { duration: full ? DUR.xs : DUR.sm },
  }

  return (
    <AnimatePresence>
      {active ? (
        skippable ? (
          <m.button
            key="cut"
            type="button"
            aria-label={`${CUT_CAPTION}。${CUT_AGAIN}（タップまたは Esc でスキップ）`}
            onClick={finish}
            {...shared}
            className={`${shared.className} cursor-pointer`}
          >
            {content}
          </m.button>
        ) : (
          <m.output key="cut" aria-live="polite" {...shared}>
            {content}
          </m.output>
        )
      ) : null}
    </AnimatePresence>
  )
}
