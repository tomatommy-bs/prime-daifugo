'use client'
/**
 * A seat at the table (spec §6.3, §7.5–7.6; catalogue §9.2 #3, #8, #11, #12, #23).
 *
 * A seat NEVER renders card faces, for anyone: only a mini back (▣) and the hand count.
 * Every state pairs colour with a glyph: `▲` lead, `∅` passed, `観戦` observer, `+n` penalty,
 * and the active seat carries `aria-current="true"`.
 */
import { DUR, EASE, SPRING, motionPreset, useMotionMode } from '@/design/motion'
import { GameCard } from '@/game-card/src'
import { AnimatePresence, m } from 'framer-motion'
import { type CSSProperties, useContext, useEffect, useRef } from 'react'
import { SeatClock, TurnClockContext } from './TurnTimer'
import { seatHueVar } from './seat-model'

export type SeatProps = {
  /** player id: written to `data-seat-anchor` so card flights can land on the seat */
  id?: string
  name: string
  handCount: number | null
  hueIndex: number
  isSelf?: boolean
  isActive?: boolean
  isLead?: boolean
  passed?: boolean
  observer?: boolean
  leftTime?: number
  timeLimit?: number
  /** `+n` penalty chip */
  penalty?: number
  /** reserved for future variants (no joker / 1729 visuals) */
  variant?: 'default'
  layout: 'chip' | 'node'
}

/** Screen-reader summary of a seat, e.g. `bob、手札 9 枚、場の主、手番`. */
export function seatLabel({
  name,
  handCount,
  isSelf,
  isActive,
  isLead,
  passed,
  observer,
  penalty,
}: Omit<SeatProps, 'layout' | 'hueIndex'>): string {
  const parts = [isSelf ? `${name}（あなた）` : name]
  if (observer) {
    parts.push('観戦')
  } else if (handCount !== null) {
    parts.push(`手札 ${handCount} 枚`)
  }
  if (isLead) {
    parts.push('場の主')
  }
  if (passed) {
    parts.push('パス')
  }
  if (penalty && penalty > 0) {
    parts.push(`ペナルティ +${penalty} 枚`)
  }
  if (isActive) {
    parts.push('手番')
  }
  return parts.join('、')
}

/** One or two stacked card backs, decorative. */
/** A hairline in ink so the dark Ulam back still reads on the dark surfaces. */
const BACK_EDGE = {
  outline: '1px solid color-mix(in srgb, var(--ink) 30%, transparent)',
  borderRadius: 2,
} as const

function MiniBacks({ count, height }: { count: number; height: number | string }) {
  const layers = count >= 2 ? 2 : count === 1 ? 1 : 0
  if (layers === 0) {
    return (
      <span
        aria-hidden="true"
        data-mini-back="empty"
        className="inline-block rounded-[3px] border border-dashed"
        style={{
          height,
          width: `calc(${typeof height === 'number' ? `${height}px` : height} * 0.69)`,
          borderColor: 'var(--border-strong)',
        }}
      />
    )
  }
  return (
    <span aria-hidden="true" data-mini-back={layers} className="relative inline-flex">
      {layers === 2 ? (
        <GameCard
          card="Back"
          role="presentation"
          aria-hidden="true"
          focusable="false"
          className="absolute top-0 left-0"
          style={{ fontSize: height, transform: 'translate(3px, -1px) rotate(6deg)', ...BACK_EDGE }}
        />
      ) : null}
      <GameCard
        card="Back"
        role="presentation"
        aria-hidden="true"
        focusable="false"
        className="relative"
        style={{ fontSize: height, filter: 'drop-shadow(0 1px 0 rgb(0 0 0 / .15))', ...BACK_EDGE }}
      />
    </span>
  )
}

/** Hand count that bumps `scale [1.2, 1]` whenever it changes (not on mount). */
function HandCount({ value, full, size }: { value: number; full: boolean; size: string }) {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])
  return (
    <m.span
      key={value}
      data-hand-count={value}
      className="num inline-block font-bold leading-none tabular-nums"
      style={{ fontSize: size }}
      initial={full && mounted.current ? { scale: 1.2 } : false}
      animate={{ scale: 1 }}
      transition={SPRING.snap}
    >
      {value}
    </m.span>
  )
}

export function Seat({
  id,
  name,
  handCount,
  hueIndex,
  isSelf = false,
  isActive = false,
  isLead = false,
  passed = false,
  observer = false,
  leftTime,
  timeLimit,
  penalty,
  variant = 'default',
  layout,
}: SeatProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const preset = motionPreset(!full)
  const hue = seatHueVar(hueIndex)
  const node = layout === 'node'
  const quiet = passed || observer
  const label = seatLabel({
    name,
    handCount,
    isSelf,
    isActive,
    isLead,
    passed,
    observer,
    penalty,
  })

  const nameEl = (
    <span className="inline-flex min-w-0 items-center gap-fib-1">
      <span
        aria-hidden="true"
        data-hue={hueIndex}
        className="inline-block shrink-0 rounded-full"
        style={{ width: 6, height: 6, background: 'var(--seat-hue)' }}
      />
      <span
        data-seat-name=""
        className={
          node ? 'max-w-[9em] truncate' : 'max-w-[6.5em] truncate portrait-phone:max-w-[4.5em]'
        }
        style={{
          fontWeight: isActive ? 700 : 600,
          color: quiet || !isActive ? 'var(--ink-muted)' : 'var(--ink)',
          fontSize: node ? 'var(--fs-0)' : 'var(--fs--1)',
        }}
      >
        {name}
      </span>
      {isSelf ? (
        <span
          className="shrink-0 rounded-[var(--r-1)] px-[3px] leading-tight"
          style={{
            fontSize: 'var(--fs--1)',
            color: 'var(--mod)',
            border: '1px solid currentColor',
          }}
        >
          あなた
        </span>
      ) : null}
    </span>
  )

  const handEl = observer ? (
    <span
      data-observer=""
      className="shrink-0 rounded-[var(--r-1)] px-fib-1 leading-tight"
      style={{
        fontSize: 'var(--fs--1)',
        color: 'var(--ink-muted)',
        border: '1px dashed var(--border-strong)',
      }}
    >
      観戦
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-fib-1" style={{ color: 'var(--ink)' }}>
      {/* phone portrait: the count alone, so the residue line fits 390px */}
      <span className={node ? 'inline-flex' : 'inline-flex portrait-phone:hidden'}>
        <MiniBacks count={handCount ?? 0} height={node ? 'var(--card-seat)' : 16} />
      </span>
      {handCount === null ? (
        <span className="num" style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}>
          —
        </span>
      ) : (
        <HandCount value={handCount} full={full} size={node ? 'var(--fs-0)' : 'var(--fs--1)'} />
      )}
    </span>
  )

  const markers = (
    <span className="inline-flex shrink-0 items-center gap-[3px]">
      <AnimatePresence initial={false}>
        {isLead ? (
          <m.span
            key="lead"
            layoutId={full ? 'lead' : undefined}
            data-marker="lead"
            title="場の主"
            className="num leading-none"
            style={{ color: 'var(--gold)', fontSize: 'var(--fs--1)' }}
            variants={preset.pop}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            ▲
          </m.span>
        ) : null}
        {passed ? (
          <m.span
            key="passed"
            data-marker="passed"
            title="パス"
            className="num leading-none"
            style={{ color: 'var(--ink-muted)', fontSize: node ? 'var(--fs-0)' : 'var(--fs--1)' }}
            variants={preset.pop}
            initial="hidden"
            animate="show"
            exit="hidden"
          >
            ∅
          </m.span>
        ) : null}
        {penalty && penalty > 0 ? (
          <m.span
            key={`penalty-${penalty}`}
            data-marker="penalty"
            className="num rounded-[var(--r-1)] px-[3px] font-bold leading-tight"
            style={{
              fontSize: 'var(--fs--1)',
              color: 'var(--on-prime)',
              background: 'var(--danger)',
            }}
            initial={full ? { opacity: 0, y: 4 } : false}
            animate={full ? { opacity: [0, 1, 1, 0], y: [4, 0, -4, -12] } : { opacity: 1 }}
            transition={
              full
                ? // #23: floats up 12px and fades over 610 ms
                  { duration: DUR.xl, times: [0, 0.15, 0.5, 1], ease: EASE.out }
                : { duration: 0 }
            }
          >
            +{penalty}
          </m.span>
        ) : null}
      </AnimatePresence>
    </span>
  )

  // with a live clock (GameBoard) the dial ticks on its own; else the model's leftTime
  const liveClock = useContext(TurnClockContext) !== null
  const showTimer =
    node && isActive && timeLimit !== undefined && (liveClock || leftTime !== undefined)

  return (
    <m.fieldset
      aria-label={label}
      aria-current={isActive ? 'true' : undefined}
      data-seat=""
      data-seat-anchor={id}
      data-layout={layout}
      data-active={isActive ? 'true' : 'false'}
      data-self={isSelf ? 'true' : undefined}
      data-observer-seat={observer ? 'true' : undefined}
      data-passed={passed ? 'true' : undefined}
      data-variant={variant}
      data-motion={mode}
      className={
        node
          ? 'relative m-0 inline-flex min-w-0 flex-col items-start gap-fib-1 rounded-[var(--r-3)] border-0 px-fib-3 py-fib-2'
          : 'relative m-0 inline-flex h-[30px] min-w-0 items-center gap-fib-2 rounded-[var(--r-2)] border-0 px-fib-2 py-0'
      }
      style={
        {
          '--seat-hue': hue,
          background: isActive ? 'var(--surface-raised)' : node ? 'var(--surface)' : 'transparent',
          // node: a --mod ring; chip: lifted only (the shared turn pointer underlines it)
          boxShadow: isActive
            ? node
              ? 'var(--shadow-2), 0 0 0 2px var(--mod)'
              : 'var(--shadow-1), 0 0 0 1px var(--line)'
            : node
              ? 'var(--shadow-1), 0 0 0 1px var(--line)'
              : 'none',
          opacity: observer ? 0.85 : 1,
        } as CSSProperties
      }
      initial={false}
      animate={full && isActive ? { y: -2, scale: 1.04 } : { y: 0, scale: 1 }}
      transition={SPRING.snap}
    >
      {node ? (
        <>
          <span className="inline-flex items-center gap-fib-2">
            {nameEl}
            {markers}
          </span>
          <span className="inline-flex items-center gap-fib-3">
            {handEl}
            {showTimer ? (
              <SeatClock
                active={true}
                leftTime={leftTime}
                timeLimit={timeLimit}
                size={28}
                hideWhenIdle={true}
              />
            ) : null}
          </span>
        </>
      ) : (
        <>
          {nameEl}
          {handEl}
          {markers}
        </>
      )}
    </m.fieldset>
  )
}
