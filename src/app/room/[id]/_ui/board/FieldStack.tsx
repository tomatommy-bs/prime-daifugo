'use client'
/**
 * The field (spec §6.3, §7.5–7.6; catalogue §9.2 #19, #24).
 *
 * Shows the history as a sequence (`13 < 47 <`), the top cards, `= NumberGlyph` in `--prime`
 * (the field top is a confirmed prime) with a `--prime` underline, and the constraint readout
 * `k = 2 枚 · > 1013`, or `k = 自由` when the field is empty. On flow (field → []) the last
 * sequence is struck through like a sieve pass before it clears.
 */
import { NumberGlyph } from '@/design/NumberGlyph'
import { DUR, EASE, stagger, useMotionMode } from '@/design/motion'
import { type CardId, GameCard, getCardInteger } from '@/game-card/src'
import { concatCardNumbers } from '@/utils/play-card'
import { AnimatePresence, m } from 'framer-motion'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { FieldSequence } from './FieldSequence'

export type FieldStackProps = {
  field: CardId[][]
  leadName?: string | null
  /** older values kept in the sequence readout, default 3 */
  compactHistory?: number
  /** reserved for future variants (no joker / 1729 visuals) */
  variant?: 'default'
  /** ResultOverlay / GrothendieckCut layered over the field */
  resultOverlay?: ReactNode
}

export const FREE_READOUT = 'k = 自由'

/** `k = 2 枚 · > 1013`, or `k = 自由` for an empty field (pure arithmetic, no primality). */
export function constraintReadout(top: CardId[] | null): string {
  if (!top || top.length === 0) {
    return FREE_READOUT
  }
  return `k = ${top.length} 枚 · > ${concatCardNumbers(top)}`
}

/** Values of every field entry except the top, oldest first. */
export const historyValues = (field: CardId[][]): number[] =>
  field.slice(0, -1).map((cards) => concatCardNumbers(cards))

const STRIKE_HOLD_MS = 987

/** How the top group leaves: shrinking into the sequence, or swept away by a flow. */
const topExit = {
  replace: { opacity: 0, scale: 0.4, x: -48, transition: { duration: DUR.lg, ease: EASE.in } },
  flow: {
    opacity: 0,
    scale: 0.382,
    rotate: -90,
    x: -24,
    y: 16,
    transition: { duration: DUR.lg, ease: EASE.in },
  },
  reduced: { opacity: 0, transition: { duration: DUR.sm } },
}

export function FieldStack({
  field,
  leadName = null,
  compactHistory = 3,
  variant = 'default',
  resultOverlay,
}: FieldStackProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const top = field.at(-1) ?? null
  const hasTop = top !== null && top.length > 0
  const topValue = hasTop ? concatCardNumbers(top) : null
  const history = historyValues(field)
  const readout = constraintReadout(top)

  // flow: remember the last non-empty sequence and strike it out once the field clears
  const lastSequence = useRef<number[]>([])
  const [struckValues, setStruckValues] = useState<number[] | null>(null)
  useEffect(() => {
    if (field.length > 0) {
      lastSequence.current = field.map((cards) => concatCardNumbers(cards))
      setStruckValues(null)
      return
    }
    if (lastSequence.current.length === 0) {
      return
    }
    setStruckValues(lastSequence.current)
    lastSequence.current = []
    const hold = full ? STRIKE_HOLD_MS + stagger(compactHistory) * 1000 : 1597
    const id = setTimeout(() => setStruckValues(null), hold)
    return () => clearTimeout(id)
  }, [field, full, compactHistory])

  const exitKind = !full ? 'reduced' : field.length === 0 ? 'flow' : 'replace'
  const topKey = hasTop ? top.join('-') : 'empty'

  return (
    <section
      aria-label="場"
      data-field-stack=""
      data-variant={variant}
      data-motion={mode}
      data-empty={hasTop ? undefined : 'true'}
      className="relative flex min-w-0 flex-col items-center justify-center gap-fib-2"
    >
      <div className="flex min-w-0 max-w-full items-center gap-fib-3">
        {struckValues ? (
          <FieldSequence values={struckValues} struck={true} layout="line" max={compactHistory} />
        ) : history.length > 0 ? (
          <FieldSequence values={history} layout="line" max={compactHistory} trailing={true} />
        ) : null}

        <AnimatePresence mode="popLayout" initial={false} custom={exitKind}>
          {hasTop ? (
            <m.div
              key={topKey}
              custom={exitKind}
              data-field-top=""
              className="relative flex items-end gap-fib-3"
              initial={full ? { opacity: 0, scale: 0.96 } : { opacity: 0 }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
              exit="exit"
              variants={{ exit: (kind: keyof typeof topExit) => topExit[kind] }}
              transition={full ? { duration: DUR.md, ease: EASE.out } : { duration: DUR.sm }}
            >
              <div className="relative flex flex-col items-stretch">
                <ul
                  aria-label={`場のカード ${top.map((c) => getCardInteger(c)).join(', ')}`}
                  className="m-0 flex list-none gap-fib-1 p-0"
                >
                  {top.map((card, i) => (
                    <m.li
                      key={card}
                      layoutId={full ? `card-${card}` : undefined}
                      data-card={card}
                      className="flex"
                      transition={full ? { delay: i * 0.034 } : undefined}
                    >
                      <GameCard
                        card={card}
                        role="presentation"
                        aria-hidden="true"
                        focusable="false"
                        style={{
                          fontSize: 'var(--card-field)',
                          filter: 'drop-shadow(var(--shadow-1))',
                        }}
                      />
                    </m.li>
                  ))}
                </ul>
                {/* confirmed: the --prime underline draws under the stack */}
                <m.span
                  aria-hidden="true"
                  data-confirmed=""
                  className="mt-fib-1 block h-[2px] rounded-full"
                  style={{ background: 'var(--prime)', originX: 0 }}
                  initial={full ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={
                    full ? { duration: DUR.md, ease: EASE.out, delay: DUR.sm } : { duration: 0 }
                  }
                />
              </div>
              <span className="inline-flex items-baseline gap-fib-2 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="num"
                  style={{ fontSize: 'var(--fs-3)', color: 'var(--ink-muted)' }}
                >
                  =
                </span>
                <NumberGlyph value={topValue} size={3} tone="prime" srLabel={`場 ${topValue}`} />
              </span>
            </m.div>
          ) : (
            <m.div
              key="empty"
              data-field-empty=""
              aria-hidden="true"
              className="flex items-center justify-center rounded-[var(--r-2)]"
              style={{
                height: 'var(--card-field)',
                width: 'calc(var(--card-field) * 0.69)',
                border: '1.5px dashed var(--border-strong)',
                color: 'var(--ink-muted)',
                fontSize: 'var(--fs-3)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.sm, delay: full ? DUR.md : 0 }}
            >
              ∅
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <p
        className="num m-0 flex items-baseline gap-fib-3 whitespace-nowrap"
        style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}
      >
        <span data-readout="">{readout}</span>
        {hasTop && leadName ? (
          <span data-lead-name="" className="inline-flex items-baseline gap-[3px]">
            <span aria-hidden="true" style={{ color: 'var(--gold)' }}>
              ▲
            </span>
            <span className="sr-only">場の主</span>
            <span className="max-w-[8em] truncate" style={{ fontFamily: 'var(--font-sans)' }}>
              {leadName}
            </span>
          </span>
        ) : null}
      </p>

      {resultOverlay ? (
        <div data-field-overlay="" className="absolute inset-0 z-10">
          {resultOverlay}
        </div>
      ) : null}
    </section>
  )
}
