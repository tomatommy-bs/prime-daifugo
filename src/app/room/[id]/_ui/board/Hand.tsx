'use client'

import { DUR, EASE, SPRING, useMotionMode } from '@/design/motion'
import { type FanItem, fanLayout } from '@/design/math/geometry'
import { type CardId, MathCard, type MathCardMotionProps } from '@/game-card/src'
import { useIsomorphicEffect } from '@mantine/hooks'
import { m } from 'framer-motion'
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react'
import { FRESH_MS, cardWidthFromHeight, rovingIndex } from './card-tray-utils'

export type HandProps = {
  cardIds: CardId[]
  isMyTurn: boolean
  mode: 'basic' | 'factor'
  /** drawn or penalty cards, underlined for 2584 ms */
  freshIds?: CardId[]
  /** value chips under each card (A=1 … K=13) */
  showValues?: boolean
  onSelect: (card: CardId) => void
  layout?: 'auto' | 'fan' | 'scroll' | 'wrap'
  /** container width in px; measured when omitted (tests, gallery) */
  width?: number
  /** card height in px; measured from `--card-hand` when omitted */
  cardHeight?: number
}

type ResolvedLayout = 'fan' | 'scroll' | 'wrap'

/** Fallback card height before measurement (the `--card-hand` clamp maximum). */
const FALLBACK_CARD_H = 132
/** Room above the cards for the hover lift (max 8px) and the focus ring. */
const PAD_TOP = 12
const PAD_BOTTOM = 6
/** Deepest arc drop, as a fraction of the card height. */
const ARC_MAX = 0.1
/** sin 10°: how far a rotated fan card's top corner swings out, per unit of card height. */
const ROTATE_OVERHANG = 0.174
/** Card width / height (spec §7.5: w = 0.6886·h). */
const CARD_RATIO = 0.6886
const CHIP_H = 20

/** Layout of `n` cards for the requested mode (exported for tests and stories). */
export function resolveHandLayout({
  layout,
  n,
  W,
  cardW,
}: {
  layout: NonNullable<HandProps['layout']>
  n: number
  W: number
  cardW: number
}): { mode: ResolvedLayout; step: number; items: FanItem[] } {
  if (layout === 'wrap') {
    return { mode: 'wrap', step: 0, items: [] }
  }
  if (!(W > 0)) {
    // not measured yet: a plain row never overlaps
    return { mode: layout === 'fan' ? 'fan' : 'scroll', step: cardW + 8, items: [] }
  }
  // Rotated cards swing their top corners out by about h·sin θ (θ ≤ 10°): fan inside an
  // inset row so the outer cards never cross the board edge.
  const inset = n > 1 ? Math.ceil(ROTATE_OVERHANG * (cardW / CARD_RATIO)) : 0
  const fan = fanLayout({ n, W: W - 2 * inset, cardW })
  if (layout === 'scroll' || (layout === 'auto' && fan.mode === 'scroll')) {
    return { mode: 'scroll', step: fan.mode === 'scroll' ? fan.step : cardW + 8, items: [] }
  }
  if (fan.mode === 'fan') {
    // R = 4W gives a deep arc on wide rows; keep the drop within ARC_MAX of the card
    // height so the fan fits the 128px compact hand row (§7.5 vertical budget).
    const depth = fan.items.reduce((acc, it) => Math.max(acc, it.y), 0)
    const cap = ARC_MAX * (cardW / CARD_RATIO)
    const k = depth > cap ? cap / depth : 1
    return {
      mode: 'fan',
      step: fan.step,
      items: fan.items.map((it) => ({ ...it, x: it.x + inset, y: it.y * k })),
    }
  }
  // forced fan with too many cards: spread evenly, overlapping below the slice threshold
  const step = n > 1 ? Math.max(0, (W - cardW) / (n - 1)) : 0
  return {
    mode: 'fan',
    step,
    items: Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0, rotate: 0 })),
  }
}

/** Live freshness: ids stay fresh for `FRESH_MS` after they last appeared in `freshIds`. */
function useFreshIds(freshIds: CardId[] | undefined): ReadonlySet<CardId> {
  const [fresh, setFresh] = useState<ReadonlySet<CardId>>(() => new Set(freshIds ?? []))
  const timers = useRef(new Map<CardId, ReturnType<typeof setTimeout>>())
  const key = (freshIds ?? []).join(',')

  useEffect(() => {
    if (!key) {
      return
    }
    const ids = key.split(',') as CardId[]
    setFresh((prev) => new Set([...prev, ...ids]))
    for (const id of ids) {
      const existing = timers.current.get(id)
      if (existing) {
        clearTimeout(existing)
      }
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id)
          setFresh((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, FRESH_MS),
      )
    }
  }, [key])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) {
        clearTimeout(t)
      }
      map.clear()
    }
  }, [])

  return fresh
}

/** Container width and card height, measured from the DOM (ResizeObserver). */
function useHandMetrics(widthProp?: number, cardHeightProp?: number) {
  const ref = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [metrics, setMetrics] = useState({ W: 0, h: 0 })

  useIsomorphicEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const measure = () => {
      const W = el.clientWidth
      const h = probeRef.current?.offsetHeight ?? 0
      setMetrics((prev) => (prev.W === W && prev.h === h ? prev : { W, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return {
    ref,
    probeRef,
    W: widthProp ?? metrics.W,
    h: cardHeightProp ?? (metrics.h || FALLBACK_CARD_H),
  }
}

const SCROLL_MASK =
  'linear-gradient(to right, transparent, #000 var(--sp-4), #000 calc(100% - var(--sp-4)), transparent)'

/**
 * My hand (spec §7.5): a horizontal `listbox` named 手札 with a roving tabindex.
 *
 * - ←/→/Home/End move focus, Enter/Space (or a click) call `onSelect`.
 * - `auto` layout: an arc fan from `fanLayout`; when the exposed slice of a card drops below
 *   max(32px, 0.38w) it becomes a scroll-snap row with edge fades.
 * - On my turn: a `--mod` top rule (`--factor` in factor mode), a 4px lift and one glow pulse.
 *   Off turn the cards only desaturate: opacity stays 1 and selection keeps working.
 * - `freshIds` cards show the gold `fresh` tick for 2584 ms.
 */
export function Hand({
  cardIds,
  isMyTurn,
  mode,
  freshIds,
  showValues = false,
  onSelect,
  layout = 'auto',
  width,
  cardHeight,
}: HandProps) {
  const motionMode = useMotionMode()
  const reduced = motionMode === 'reduced'
  const fresh = useFreshIds(freshIds)
  const { ref, probeRef, W, h } = useHandMetrics(width, cardHeight)
  const cardW = cardWidthFromHeight(h)
  const n = cardIds.length
  const resolved = resolveHandLayout({ layout, n, W, cardW })

  /* ---------------- roving tabindex ---------------- */
  const [active, setActive] = useState(0)
  const hasFocus = useRef(false)
  const activeIndex = n === 0 ? 0 : Math.min(active, n - 1)

  const optionAt = (index: number) =>
    ref.current?.querySelector<HTMLElement>(`[role="option"][data-card="${cardIds[index]}"]`) ??
    null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingIndex(e.key, activeIndex, n)
    if (next === null) {
      return
    }
    e.preventDefault()
    setActive(next)
    optionAt(next)?.focus()
  }
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    hasFocus.current = true
    const card = (e.target as HTMLElement).getAttribute('data-card') as CardId | null
    const index = card ? cardIds.indexOf(card) : -1
    if (index >= 0 && index !== activeIndex) {
      setActive(index)
    }
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      hasFocus.current = false
    }
  }

  // A selected card leaves the hand: keep keyboard focus on the hand at the same slot.
  const cardsKey = cardIds.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus only when the cards change
  useEffect(() => {
    if (!hasFocus.current || n === 0) {
      return
    }
    const focused = document.activeElement
    if (!focused || focused === document.body || !ref.current?.contains(focused)) {
      optionAt(activeIndex)?.focus()
    }
  }, [cardsKey])

  /* ---------------- turn feedback ---------------- */
  const [turnPulse, setTurnPulse] = useState(0)
  const wasMyTurn = useRef(isMyTurn)
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current) {
      setTurnPulse((v) => v + 1)
    }
    wasMyTurn.current = isMyTurn
  }, [isMyTurn])

  const ruleColor = mode === 'factor' ? 'var(--factor)' : 'var(--mod)'
  const maxY = resolved.items.reduce((acc, it) => Math.max(acc, it.y), 0)
  const chip = showValues ? CHIP_H : 0
  const fanHeight = PAD_TOP + h + maxY + chip + PAD_BOTTOM

  const option = (
    card: CardId,
    index: number,
    motionProps?: MathCardMotionProps,
    style?: CSSProperties,
  ) => (
    <MathCard
      key={card}
      card={card}
      size={`${h}px`}
      role="option"
      aria-selected={false}
      tabIndex={index === activeIndex ? 0 : -1}
      state={fresh.has(card) ? 'fresh' : 'rest'}
      showValue={showValues}
      onActivate={() => onSelect(card)}
      motionProps={motionProps}
      style={style}
    />
  )

  let body: ReactElement
  if (resolved.mode === 'fan' && resolved.items.length === n && n > 0) {
    body = (
      <div className="relative w-full" style={{ height: fanHeight }} data-fan-step={resolved.step}>
        {cardIds.map((card, i) => {
          const it = resolved.items[i]
          return option(
            card,
            i,
            // Static placement through left/top and the CSS `rotate` property: framer's
            // projection owns `transform` on layoutId cards (and dropped animate x/y), so
            // slot moves are animated as layout position changes instead.
            { layout: reduced ? false : 'position', transition: SPRING.card },
            {
              position: 'absolute',
              left: it.x,
              top: PAD_TOP + it.y,
              rotate: `${it.rotate}deg`,
              zIndex: i,
              transformOrigin: '50% 100%',
            },
          )
        })}
      </div>
    )
  } else if (resolved.mode === 'wrap') {
    body = (
      <div
        className="flex w-full flex-wrap justify-center gap-x-[var(--sp-2)] gap-y-[var(--sp-3)]"
        style={{ paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM }}
      >
        {cardIds.map((card, i) => option(card, i, { layout: reduced ? false : 'position' }))}
      </div>
    )
  } else {
    const overlap = Math.min(0, resolved.step - cardW)
    body = (
      <div
        className="flex w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-scroll-row=""
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: 'var(--sp-4)',
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM,
          paddingInline: 'var(--sp-4)',
          maskImage: SCROLL_MASK,
          WebkitMaskImage: SCROLL_MASK,
        }}
      >
        {cardIds.map((card, i) =>
          option(
            card,
            i,
            { layout: reduced ? false : 'position' },
            {
              scrollSnapAlign: 'start',
              marginInlineEnd: i === n - 1 ? 0 : overlap || 'var(--sp-2)',
              zIndex: i,
            },
          ),
        )}
      </div>
    )
  }

  return (
    <m.div
      className="relative w-full"
      data-motion={motionMode}
      data-my-turn={isMyTurn}
      data-mode={mode}
      initial={false}
      animate={{ y: isMyTurn && !reduced ? -4 : 0 }}
      transition={SPRING.soft}
    >
      {/* turn rule */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-line"
      />
      <m.span
        aria-hidden="true"
        data-turn-rule=""
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-center"
        style={{ background: ruleColor }}
        initial={false}
        animate={isMyTurn ? { scaleX: 1, opacity: 1 } : { scaleX: reduced ? 1 : 0.2, opacity: 0 }}
        transition={reduced ? { duration: DUR.sm } : { duration: DUR.lg, ease: EASE.out }}
      />
      {turnPulse > 0 && !reduced ? (
        <m.span
          key={turnPulse}
          aria-hidden="true"
          data-turn-glow=""
          className="pointer-events-none absolute inset-x-0 top-0 h-[var(--sp-6)]"
          style={{
            background: `linear-gradient(to bottom, color-mix(in srgb, ${ruleColor} 22%, transparent), transparent)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: DUR.xl, times: [0, 0.236, 1], ease: 'easeOut' }}
        />
      ) : null}

      <span
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute"
        style={{ height: 'var(--card-hand)', width: 0 }}
      />

      <div
        ref={ref}
        // biome-ignore lint/a11y/useSemanticElements: a card listbox, not a <select>
        role="listbox"
        aria-label="手札"
        aria-orientation="horizontal"
        tabIndex={n === 0 ? 0 : -1}
        data-layout={resolved.mode}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="relative w-full outline-none transition-[filter] duration-[var(--t-md)]"
        style={{ filter: isMyTurn ? undefined : 'saturate(.618)' }}
      >
        {n === 0 ? (
          <p
            className="flex items-center justify-center text-ink-muted"
            style={{ height: PAD_TOP + h * 0.5, fontSize: 'var(--fs--1)' }}
          >
            手札なし
          </p>
        ) : (
          body
        )}
      </div>
    </m.div>
  )
}
