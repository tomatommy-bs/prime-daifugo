'use client'
/**
 * Field history as a strictly increasing sequence (spec §6.3, §7.5–7.6; catalogue §9.2 #19, #24).
 *
 * `line`: `13 < 47 < 1013`; past `max` values the oldest collapse to `… <`.
 * `phyllotaxis`: older values spiral around the newest at the golden angle (Vogel), shrinking
 * by φ per step but never below `--fs--1`.
 * `struck`: each value is struck through like a sieve pass (flow 流れ), staggered 55 ms.
 */
import { phyllotaxis } from '@/design/math/geometry'
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { AnimatePresence, m } from 'framer-motion'

export type FieldSequenceProps = {
  /** strictly increasing field values, oldest first */
  values: number[]
  /** struck out like a sieve (flow) */
  struck?: boolean
  layout: 'line' | 'phyllotaxis'
  /** values shown before collapsing to `… <` (line), default 3 */
  max?: number
  /** append a trailing `<` (the sequence continues into the current field top) */
  trailing?: boolean
}

export const ELLIPSIS = '…'
const STRIKE_STAGGER = 0.055
/** phyllotaxis shows at most this many values */
export const PHYLLO_MAX = 8

/** The values a `line` readout shows, and whether older ones collapsed. */
export function visibleSequence(
  values: number[],
  max = 3,
): { shown: number[]; collapsed: boolean } {
  const cap = Math.max(1, Math.floor(max))
  if (values.length <= cap) {
    return { shown: values, collapsed: false }
  }
  return { shown: values.slice(-cap), collapsed: true }
}

/** Plain-text reading, e.g. `… < 47 < 1013 < 1103`. */
export function sequenceText(values: number[], max = 3, trailing = false): string {
  const { shown, collapsed } = visibleSequence(values, max)
  const parts = [...(collapsed ? [ELLIPSIS] : []), ...shown.map(String)]
  return parts.join(' < ') + (trailing && parts.length > 0 ? ' <' : '')
}

/** A sieve strike: a line drawn through the value from left to right. */
function Strike({ index, full }: { index: number; full: boolean }) {
  return (
    <m.span
      aria-hidden="true"
      data-strike=""
      className="pointer-events-none absolute top-1/2 right-[-2px] left-[-2px] h-[1.5px] rounded-full"
      style={{ background: 'var(--ink-muted)', originX: 0 }}
      initial={full ? { scaleX: 0 } : false}
      animate={{ scaleX: 1 }}
      transition={
        full ? { duration: DUR.md, ease: EASE.out, delay: index * STRIKE_STAGGER } : { duration: 0 }
      }
    />
  )
}

function FlowChip() {
  return (
    <m.span
      data-chip="flow"
      className="ml-fib-2 rounded-[var(--r-1)] px-fib-1 font-semibold"
      style={{
        fontSize: 'var(--fs--1)',
        color: 'var(--ink-muted)',
        border: '1px solid var(--border-strong)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.sm }}
    >
      流れ
    </m.span>
  )
}

export function FieldSequence({
  values,
  struck = false,
  layout,
  max = 3,
  trailing = false,
}: FieldSequenceProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const text = sequenceText(values, layout === 'line' ? max : PHYLLO_MAX, trailing)

  if (values.length === 0) {
    return (
      <p
        data-field-sequence=""
        data-layout={layout}
        data-motion={mode}
        data-empty="true"
        className="m-0"
      />
    )
  }

  if (layout === 'phyllotaxis') {
    const shown = values.slice(-PHYLLO_MAX)
    const newestFirst = [...shown].reverse()
    const c = 30
    return (
      <p
        data-field-sequence=""
        data-layout="phyllotaxis"
        data-motion={mode}
        data-struck={struck ? 'true' : undefined}
        className="relative m-0"
        style={{ width: c * 6, height: c * 6 }}
      >
        <span className="sr-only">場の履歴 {text}</span>
        <AnimatePresence initial={false}>
          {newestFirst.map((v, age) => {
            const p = phyllotaxis(age, c)
            return (
              // Anchored at the centre; the spiral offset is a transform (x / y), never an
              // animated left / top, so moving a value does not re-lay out the field (§9.1).
              <m.span
                key={v}
                aria-hidden="true"
                data-value={v}
                data-age={age}
                className="num absolute top-1/2 left-1/2 whitespace-nowrap font-bold leading-none tabular-nums"
                style={{
                  // shrink by φ^−age through the type size, never below --fs--1
                  fontSize: `max(var(--fs--1), calc(var(--fs-1) * ${p.scale.toFixed(4)}))`,
                  color: age === 0 ? 'var(--ink)' : 'var(--ink-muted)',
                }}
                initial={full ? { opacity: 0, x: 0, y: 0 } : false}
                animate={{
                  opacity: p.opacity,
                  x: Number(p.x.toFixed(1)),
                  y: Number(p.y.toFixed(1)),
                }}
                exit={{ opacity: 0 }}
                transition={full ? { duration: DUR.lg, ease: EASE.out } : { duration: 0 }}
              >
                <span className="relative block -translate-x-1/2 -translate-y-1/2">
                  {v}
                  {struck ? <Strike index={age} full={full} /> : null}
                </span>
              </m.span>
            )
          })}
        </AnimatePresence>
        {struck ? <FlowChip /> : null}
      </p>
    )
  }

  const { shown, collapsed } = visibleSequence(values, max)
  return (
    <p
      data-field-sequence=""
      data-layout="line"
      data-motion={mode}
      data-struck={struck ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      className="num m-0 inline-flex items-baseline whitespace-nowrap leading-none tabular-nums"
      style={{ fontSize: 'var(--fs-1)', color: 'var(--ink-muted)' }}
    >
      {collapsed ? (
        <span data-ellipsis="" className="whitespace-pre">
          {`${ELLIPSIS} < `}
        </span>
      ) : null}
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((v, i) => (
          <m.span
            key={v}
            layout={full ? 'position' : false}
            data-value={v}
            className="inline-flex items-baseline"
            // the previous field top shrinks in from the right (#19)
            initial={full ? { opacity: 0, x: 24, scale: 1.4 } : { opacity: 0 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12 }}
            transition={full ? { duration: DUR.lg, ease: EASE.out } : { duration: DUR.sm }}
          >
            <span className="relative font-bold">
              {v}
              {struck ? <Strike index={i} full={full} /> : null}
            </span>
            {i < shown.length - 1 || trailing ? (
              <m.span
                data-lt=""
                className="whitespace-pre"
                initial={full ? { opacity: 0, x: -4 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DUR.sm, delay: full ? DUR.md : 0 }}
              >
                {' < '}
              </m.span>
            ) : null}
          </m.span>
        ))}
      </AnimatePresence>
      {struck ? <FlowChip /> : null}
    </p>
  )
}
