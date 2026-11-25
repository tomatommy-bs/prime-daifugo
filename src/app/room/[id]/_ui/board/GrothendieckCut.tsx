'use client'
import { type Rect, clipPathPolygon, lineNormal, splitRectByLine } from '@/design/math/geometry'
/**
 * The 57 cut ceremony (spec §6.3; catalogue §9.2 #25).
 *
 * The played cards (when given) sit on the field — `FlightLayer` flies them in onto their
 * `data-cut-card` anchors — then one gold slash crosses the whole field and splits it into
 * two halves: every card is clipped along the same line (`cleaveHalves`), and the halves
 * part along the slash normal (±8px, ±4°) and fade. The caption
 * `57 — グロタンディーク素数切り` pops, then `もう一度` (the same seat plays again).
 * Tap or Esc skips straight to `onDone`. Reduced motion: the gold caption holds 1597 ms.
 */
import { DUR, EASE, SPRING, motionPreset, useMotionMode, variants } from '@/design/motion'
import { type CardId, GameCard } from '@/game-card/src'
import { AnimatePresence, type Variants, m } from 'framer-motion'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

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
/** total ceremony length (ms): land 377 → slash 233 → cleave 377 → もう一度 → done */
export const CUT_TOTAL_MS = 1597
/** the played cards land first (their flights take DUR.lg), then the slash draws */
export const SLASH_AT = DUR.lg
/** the halves part once the slash has crossed the field */
export const CLEAVE_AT = SLASH_AT + DUR.sm
/** the caption pops while the halves fade, so it never sits on top of whole cards */
const CAPTION_AT = CLEAVE_AT + DUR.md
const AGAIN_AT = CAPTION_AT + DUR.md
/** how far each half travels along the slash normal (px) and how much it turns (deg) */
export const CLEAVE_SHIFT = 8
export const CLEAVE_TURN = 4

/** The slash, as fractions of the overlay box: bottom-left → top-right. */
export const SLASH = { x1: 0.08, y1: 0.92, x2: 0.92, y2: 0.08 } as const

type Half = { clip: string; x: number; y: number; rotate: number }

/** Before measurement: each card's own anti-diagonal (parallel enough to the slash). */
const DIAGONAL_HALVES: [Half, Half] = [
  {
    clip: 'polygon(0 0, 100% 0, 0 100%)',
    x: -CLEAVE_SHIFT,
    y: -CLEAVE_SHIFT,
    rotate: -CLEAVE_TURN,
  },
  {
    clip: 'polygon(100% 0, 100% 100%, 0 100%)',
    x: CLEAVE_SHIFT,
    y: CLEAVE_SHIFT,
    rotate: CLEAVE_TURN,
  },
]

/**
 * The two halves of a card at `card` (px, relative to the overlay box `w × h`) cut by the
 * one slash across the whole field, so neighbouring cards split along a continuous line.
 * Halves move apart along the slash normal; a card the slash misses moves as one piece.
 */
export function cleaveHalves(card: Rect, w: number, h: number): [Half, Half] {
  const a = { x: SLASH.x1 * w, y: SLASH.y1 * h }
  const b = { x: SLASH.x2 * w, y: SLASH.y2 * h }
  const n = lineNormal(a, b) // points to the lower-right (positive) side
  const { neg, pos } = splitRectByLine(card, a, b)
  const half = (poly: typeof neg, sign: -1 | 1): Half => ({
    clip: clipPathPolygon(poly, card.w, card.h),
    x: sign * n.x * CLEAVE_SHIFT,
    y: sign * n.y * CLEAVE_SHIFT,
    rotate: sign * CLEAVE_TURN,
  })
  return [half(neg, -1), half(pos, 1)]
}

function Cleave({ cards, boxRef }: { cards: CardId[]; boxRef: RefObject<HTMLElement> }) {
  const cardRefs = useRef(new Map<CardId, HTMLElement>())
  const [halves, setHalves] = useState<Record<string, [Half, Half]>>({})
  const key = cards.join('-')

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure per card set
  useLayoutEffect(() => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width <= 0) {
      return
    }
    const next: Record<string, [Half, Half]> = {}
    for (const [card, el] of cardRefs.current) {
      const r = el.getBoundingClientRect()
      next[card] = cleaveHalves(
        { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height },
        box.width,
        box.height,
      )
    }
    setHalves(next)
  }, [key, boxRef])

  return (
    <span
      aria-hidden="true"
      data-cleave=""
      className="absolute inset-0 flex items-center justify-center gap-fib-1"
    >
      {cards.map((card, ci) => {
        const pair = halves[card] ?? DIAGONAL_HALVES
        const delay = CLEAVE_AT + ci * 0.034
        return (
          <span
            key={card}
            ref={(el) => {
              if (el) {
                cardRefs.current.set(card, el)
              } else {
                cardRefs.current.delete(card)
              }
            }}
            data-cut-card={card}
            className="relative inline-flex"
            style={{ fontSize: 'var(--card-field)' }}
          >
            {pair.map((h, hi) => (
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
                  delay,
                  opacity: { duration: DUR.lg, times: [0, 0.4, 1], delay },
                }}
              >
                <GameCard card={card} role="presentation" aria-hidden="true" focusable="false" />
              </m.span>
            ))}
          </span>
        )
      })}
    </span>
  )
}

export function GrothendieckCut({ active, onDone, skippable = true, cards }: GrothendieckCutProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const preset = motionPreset(!full)
  const fired = useRef(false)
  const boxRef = useRef<HTMLSpanElement>(null)
  // a variant's own transition wins over the `transition` prop, so the delay goes inside it
  const popAt = (delay: number): Variants =>
    full
      ? {
          hidden: variants.pop.hidden,
          show: { ...variants.pop.show, transition: { ...SPRING.bounce, delay } },
        }
      : preset.pop
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
      <span ref={boxRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
        {full ? (
          <svg
            aria-hidden="true"
            data-slash=""
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <m.line
              x1={`${SLASH.x1 * 100}%`}
              y1={`${SLASH.y1 * 100}%`}
              x2={`${SLASH.x2 * 100}%`}
              y2={`${SLASH.y2 * 100}%`}
              stroke="var(--gold)"
              strokeWidth={6}
              strokeLinecap="round"
              style={{ filter: 'blur(6px)' }}
              initial={{ pathLength: 0, opacity: 0.6 }}
              animate={{ pathLength: 1, opacity: [0.6, 0.6, 0] }}
              transition={{
                duration: DUR.md,
                ease: EASE.out,
                delay: SLASH_AT,
                opacity: { duration: DUR.xl, delay: SLASH_AT },
              }}
            />
            <m.line
              x1={`${SLASH.x1 * 100}%`}
              y1={`${SLASH.y1 * 100}%`}
              x2={`${SLASH.x2 * 100}%`}
              y2={`${SLASH.y2 * 100}%`}
              stroke="var(--gold)"
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DUR.md, ease: EASE.out, delay: SLASH_AT }}
            />
          </svg>
        ) : null}
        {full && cards && cards.length > 0 ? <Cleave cards={cards} boxRef={boxRef} /> : null}
      </span>
      {/* the caption plate fades in with the caption, so it never veils the cleaving cards */}
      <m.span
        data-caption-plate=""
        className="relative flex flex-col items-center gap-fib-1 rounded-[var(--r-3)] px-fib-4 py-fib-2"
        style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}
        initial={full ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={full ? { duration: DUR.sm, delay: CAPTION_AT } : { duration: 0 }}
      >
        <m.span
          aria-hidden="true"
          className="num block font-bold leading-none"
          style={{ fontSize: 'var(--fs-5)', color: 'var(--gold)' }}
          variants={popAt(CAPTION_AT)}
          initial="hidden"
          animate="show"
        >
          57
        </m.span>
        <m.span
          data-caption=""
          className="block max-w-full font-bold [text-wrap:balance] [word-break:keep-all]"
          style={{ fontSize: 'var(--fs-1)', color: 'var(--gold)' }}
          variants={popAt(CAPTION_AT + DUR.xs)}
          initial="hidden"
          animate="show"
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
      </m.span>
    </>
  )

  const shared = {
    'data-grothendieck-cut': '',
    'data-motion': mode,
    // Centred on the field and at least caption-wide: after a cut the field is already
    // empty (its box shrinks to the ∅ slot), yet the slash must cross the whole table. On
    // portrait phones the field cell sits right of the deck, so a wider box would run off
    // the screen: there it keeps the field's width and the caption wraps. The surface is
    // opaque so the previous field never ghosts through the ceremony.
    className:
      'absolute top-1/2 left-1/2 z-20 flex w-[max(100%,min(30rem,92vw))] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-[var(--r-3)] border-0 p-0 text-center portrait-phone:w-full',
    style: {
      // a floor, not a fixed height: the wrapped portrait caption grows the box instead of
      // being clipped by it
      minHeight: 'max(100%, calc(var(--card-field) * 1.236))',
      background: 'var(--bg)',
    },
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
          // no live region here: the board's LiveRegion already announces the cut (§9.4)
          <m.div key="cut" {...shared}>
            {content}
          </m.div>
        )
      ) : null}
    </AnimatePresence>
  )
}
