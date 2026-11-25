'use client'
/**
 * Compact seat bar (spec §6.3, §7.5; catalogue §9.2 #8): the residue line
 * `ℤ/nℤ ① → ② → ③ ↺`, rotated so self is first. The turn pointer is a `--mod` bar shared
 * through `layoutId="turn-pointer"`, so it slides from seat to seat. Observers sit in a
 * trailing `観戦` group, and when the turn lands on an observer (server quirk) no seat is lit.
 */
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Seat } from './Seat'
import { SeatClock } from './TurnTimer'
import { observerSeats, playerSeats, residueLabel } from './seat-model'
import type { SeatModel } from './types'

export type SeatLineProps = {
  seats: SeatModel[]
  /** players in the residue ring ℤ/nℤ */
  n: number
}

export const TURN_POINTER_ID = 'turn-pointer'

/** The `--mod` pointer under the active seat; slides between seats via a shared layoutId. */
export function TurnPointer({ reduced }: { reduced: boolean }) {
  const style = { background: 'var(--mod)', height: 2 }
  if (reduced) {
    return (
      <span
        aria-hidden="true"
        data-turn-pointer=""
        className="absolute right-fib-1 bottom-0 left-fib-1 rounded-full"
        style={style}
      />
    )
  }
  return (
    <m.span
      aria-hidden="true"
      data-turn-pointer=""
      layoutId={TURN_POINTER_ID}
      className="absolute right-fib-1 bottom-0 left-fib-1 rounded-full"
      style={style}
      transition={{ duration: DUR.lg, ease: EASE.inOut }}
    />
  )
}

/** Edge fades for the scrolling seat list, one per side that has hidden content. */
export function overflowMask(start: boolean, end: boolean): string | undefined {
  if (!start && !end) {
    return undefined
  }
  const from = start ? 'transparent, #000 var(--sp-4)' : '#000, #000'
  const to = end ? '#000 calc(100% - var(--sp-4)), transparent' : '#000, #000'
  return `linear-gradient(to right, ${from}, ${to})`
}

/**
 * Scroll `scroller` sideways (only it, never its ancestors or the page) so `item` is fully
 * visible, or starts at its left edge when it is wider than `scroller`. `scrollIntoView`
 * would also scroll the top bar and push the brand off screen.
 */
export function revealInScroller(scroller: HTMLElement, item: HTMLElement): void {
  const box = scroller.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  // An item wider than the bar (portrait phones) is aligned by its start, so the residue and
  // the name stay readable and only the trailing arrow is clipped.
  if (r.left < box.left || r.right - r.left > box.right - box.left) {
    scroller.scrollLeft -= box.left - r.left
  } else if (r.right > box.right) {
    scroller.scrollLeft += r.right - box.right
  }
}

export function SeatLine({ seats, n }: SeatLineProps) {
  const mode = useMotionMode()
  const players = playerSeats(seats)
  const observers = observerSeats(seats)
  const active = players.find((s) => s.isActive) ?? null
  const timeLimit = players.find((s) => s.timeLimit !== undefined)?.timeLimit
  const ring = `ℤ/${n}ℤ`

  // Only the seat list scrolls; the ring label and the clock stay pinned on either side, so
  // the countdown is always visible however many seats there are (portrait phones).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ start: false, end: false })
  const activeId = active?.id ?? null
  // The list scrolls sideways when it is wider than the bar: keep the active seat in view.
  // Re-run on every size change of the bar or of the list, not only when the turn moves:
  // the first pass runs before the web fonts load, when the chips are still narrower.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const measure = () => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setOverflow((o) => (o.start === start && o.end === end ? o : { start, end }))
    }
    const reveal = () => {
      if (activeId) {
        const items = el.querySelectorAll<HTMLElement>('[data-seat-id]')
        const li = [...items].find((item) => item.dataset.seatId === activeId)
        if (li) {
          revealInScroller(el, li)
        }
      }
      measure()
    }
    reveal()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal)
    ro?.observe(el)
    for (const child of el.children) {
      ro?.observe(child)
    }
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [activeId])
  const mask = overflowMask(overflow.start, overflow.end)

  return (
    <nav
      aria-label="席順"
      data-seat-line=""
      data-motion={mode}
      className="flex h-[36px] min-w-0 items-center gap-fib-2 overflow-hidden whitespace-nowrap"
    >
      <span
        className="num shrink-0 font-bold"
        style={{ fontSize: 'var(--fs--1)', color: 'var(--mod)' }}
        title="剰余環: 手番は k mod n で巡る"
      >
        {ring}
      </span>
      <div
        ref={scrollRef}
        data-seat-scroller=""
        data-overflow-start={overflow.start ? 'true' : undefined}
        data-overflow-end={overflow.end ? 'true' : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-fib-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        <ol
          aria-label={`${ring} 手番順`}
          className="m-0 flex shrink-0 list-none items-center gap-fib-1 p-0"
        >
          {players.map((s, i) => {
            const last = i === players.length - 1
            return (
              <m.li
                key={s.id}
                // same id as the waiting ring and the SeatRing: seats morph in at game start
                layoutId={mode === 'full' ? `seat-${s.id}` : undefined}
                data-k={s.k}
                data-seat-id={s.id}
                className="relative flex items-center gap-[3px] pb-[3px]"
                aria-current={s.isActive ? 'step' : undefined}
              >
                <span
                  aria-hidden="true"
                  data-residue={s.k}
                  className="num leading-none"
                  style={{
                    fontSize: 'var(--fs-0)',
                    color: s.isActive ? 'var(--mod)' : 'var(--ink-muted)',
                    fontWeight: s.isActive ? 700 : 400,
                    transition: 'color var(--t-md) var(--ease-out)',
                  }}
                >
                  {residueLabel(s.k)}
                </span>
                <Seat {...s} layout="chip" />
                {s.isActive ? <TurnPointer reduced={mode === 'reduced'} /> : null}
                <span
                  aria-hidden="true"
                  className="num px-[2px]"
                  style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}
                  title={last ? '一巡して ① に戻る' : undefined}
                >
                  {last ? '↺' : '→'}
                </span>
              </m.li>
            )
          })}
        </ol>
        {observers.length > 0 ? (
          <ul
            aria-label="観戦"
            data-observers=""
            className="m-0 ml-fib-1 flex shrink-0 list-none items-center gap-fib-1 border-l p-0 pl-fib-2"
            style={{ borderColor: 'var(--line)' }}
          >
            {observers.map((s) => (
              <li key={s.id}>
                <Seat {...s} layout="chip" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {timeLimit !== undefined ? (
        <span
          data-seat-clock=""
          className="flex shrink-0 items-center border-l pl-fib-2"
          style={{ borderColor: 'var(--line)' }}
        >
          <SeatClock
            active={active !== null}
            leftTime={active?.leftTime}
            timeLimit={timeLimit}
            size={28}
          />
        </span>
      ) : null}
    </nav>
  )
}
