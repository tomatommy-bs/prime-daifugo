'use client'
/**
 * Turn timer ring (spec §6.3, §7.5, catalogue §9.2 #9 and #10).
 *
 * The arc length is `leftTime / timeLimit`: `strokeDashoffset = C·(1 − clamp(left, 0, T)/T)`.
 * The server clock can go negative; it displays 0. At ≤ 10 s the ring turns `--danger`
 * (`data-urgency="warn"`); at ≤ 5 s the digits pulse once per tick (`"danger"`).
 */
import { timerDash } from '@/design/math/geometry'
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { m } from 'framer-motion'
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type TurnTimerProps = {
  /** seconds left; negative values display 0 */
  leftTime: number | null
  timeLimit: number
  /** diameter in px, default 28 */
  size?: number
}

export type TimerUrgency = 'none' | 'warn' | 'danger'

export const WARN_AT = 10
export const DANGER_AT = 5

/** Seconds shown on the dial: negatives clamp to 0, fractions round up. */
export const displaySeconds = (leftTime: number | null): number | null =>
  leftTime === null ? null : Math.max(0, Math.ceil(leftTime))

export function timerUrgency(leftTime: number | null): TimerUrgency {
  const s = displaySeconds(leftTime)
  if (s === null) {
    return 'none'
  }
  if (s <= DANGER_AT) {
    return 'danger'
  }
  if (s <= WARN_AT) {
    return 'warn'
  }
  return 'none'
}

/** Ring geometry for a diameter: stroke width, radius and circumference. */
export function timerGeometry(size: number) {
  const stroke = Math.max(2, Math.round(size * 0.18) / 2)
  const r = (size - stroke) / 2
  return { stroke, r, C: 2 * Math.PI * r }
}

export function TurnTimer({ leftTime, timeLimit, size = 28 }: TurnTimerProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const seconds = displaySeconds(leftTime)
  const urgency = timerUrgency(leftTime)
  const { stroke, r, C } = timerGeometry(size)
  const offset = seconds === null ? C : timerDash(seconds, timeLimit, C)
  const tone = urgency === 'none' ? 'var(--mod)' : 'var(--danger)'
  const pulsing = urgency === 'danger' && full && seconds !== null && seconds > 0

  // #10: the ring flashes twice when the clock runs out (under 3 flashes per second)
  const prev = useRef<number | null>(seconds)
  const [flashKey, setFlashKey] = useState(0)
  useEffect(() => {
    if (seconds === 0 && prev.current !== null && prev.current > 0) {
      setFlashKey((k) => k + 1)
    }
    prev.current = seconds
  }, [seconds])

  const text = seconds === null ? '—' : String(seconds)
  const digitSize = text.length >= 3 ? size * 0.34 : Math.max(size * 0.42, 11)
  const c = size / 2

  return (
    <span
      role="timer"
      aria-valuenow={seconds ?? undefined}
      aria-valuemin={0}
      aria-valuemax={timeLimit}
      aria-label={seconds === null ? '残り時間 —' : `残り ${seconds} 秒`}
      data-urgency={urgency}
      data-motion={mode}
      className="relative inline-flex shrink-0 items-center justify-center align-middle"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <m.circle
          data-ring="progress"
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap={seconds === 0 ? 'butt' : 'round'}
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          // the server ticks once a second, so the arc tweens linearly across each tick
          transition={full ? { duration: 1, ease: 'linear' } : { duration: 0 }}
          style={{ transition: 'stroke var(--t-md) var(--ease-out)' }}
        />
        {flashKey > 0 && full ? (
          <m.circle
            key={flashKey}
            data-flash="timeout"
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--danger)"
            strokeWidth={stroke * 1.75}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0, 1, 0] }}
            transition={{ duration: DUR.xl + DUR.md, ease: 'linear' }}
          />
        ) : null}
      </svg>
      <m.span
        // re-keyed every tick so the ≤ 5 s pulse plays once per second
        key={pulsing ? text : 'steady'}
        aria-hidden="true"
        data-digits={text}
        data-pulse={pulsing ? 'true' : undefined}
        className="num absolute inset-0 flex items-center justify-center font-bold leading-none"
        style={{
          fontSize: digitSize,
          color: urgency === 'none' ? 'var(--ink)' : 'var(--danger)',
        }}
        initial={pulsing ? { scale: 1 } : false}
        animate={pulsing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: DUR.md, ease: EASE.out }}
      >
        {text}
      </m.span>
      {seconds === 0 ? (
        <m.span
          data-chip="timeout"
          className="pointer-events-none absolute top-full left-1/2 z-10 mt-fib-1 whitespace-nowrap rounded-[var(--r-1)] px-fib-1 font-semibold"
          style={{
            fontSize: 'var(--fs--1)',
            background: 'var(--danger)',
            color: 'var(--on-prime)',
            x: '-50%',
          }}
          initial={full ? { opacity: 0, y: -6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={full ? { duration: DUR.md, ease: EASE.out } : { duration: 0 }}
        >
          時間切れ
        </m.span>
      ) : null}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Live clock                                                          */
/* ------------------------------------------------------------------ */

/**
 * The server ticks once a second. Holding `leftTime` as GameBoard state re-rendered the whole
 * board (and every hand card) on each tick; instead the container writes ticks into this
 * store and only the clock faces subscribe.
 */
export type TurnClock = {
  get: () => number | null
  set: (leftTime: number | null) => void
  subscribe: (listener: () => void) => () => void
}

export function createTurnClock(initial: number | null = null): TurnClock {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (next === value) {
        return
      }
      value = next
      for (const l of listeners) {
        l()
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const TurnClockContext = createContext<TurnClock | null>(null)

const NO_CLOCK = {
  get: () => null,
  subscribe: () => () => undefined,
}

/** The live clock value, or `undefined` outside a `TurnClockContext`. */
export function useTurnClock(): number | null | undefined {
  const clock = useContext(TurnClockContext)
  const source = clock ?? NO_CLOCK
  const value = useSyncExternalStore(source.subscribe, source.get, source.get)
  return clock ? value : undefined
}

export type SeatClockProps = Omit<TurnTimerProps, 'leftTime'> & {
  /** whether a seat is on turn; off turn the dial shows — */
  active: boolean
  /** seconds from the seat model, used when no live clock is provided (gallery, stories) */
  leftTime?: number | null
  /** render nothing until a first tick has arrived (the table seat node) */
  hideWhenIdle?: boolean
}

/** A TurnTimer fed by the live clock when one is provided, else by `leftTime`. */
export function SeatClock({ active, leftTime, hideWhenIdle = false, ...rest }: SeatClockProps) {
  const live = useTurnClock()
  const value = active ? (live === undefined ? (leftTime ?? null) : live) : null
  if (hideWhenIdle && value === null) {
    return null
  }
  return <TurnTimer leftTime={value} {...rest} />
}
