'use client'
/**
 * Post-result visual over the field (spec §6.3; catalogue §9.2 #19–#23).
 *
 * One visual per server result:
 * - `ok`: the value in `--prime` with an underline that draws and a single shimmer sweep;
 * - `BASE_IS_NOT_PRIME`: the value splits into a `FactorTree` (`221 → 13 · 17`);
 * - `FACT_CONTAIN_NOT_PRIME`: the offending factor is boxed with `∉ℙ`;
 * - `INCORRECT_ANSWER`: `=` morphs into `≠`.
 * Every failure carries a `+n` penalty chip. Factorization runs only here, from the props
 * given AFTER the server result, never before. `onDone` fires when the visual has played
 * (or on tap).
 */
import { Expr, typesetExpr } from '@/design/Expr'
import { FactorTree } from '@/design/FactorTree'
import { NumberGlyph } from '@/design/NumberGlyph'
import { factorize } from '@/design/math/factorize'
import { DUR, EASE, motionPreset, useMotionMode } from '@/design/motion'
import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import type { SubmitResultView } from './types'

export type ResultOverlayProps = {
  result: SubmitResultView | null
  onDone?: () => void
}

/** How long each visual holds before `onDone` (ms). Fibonacci; reduced keeps time to read. */
export const RESULT_HOLD_MS = {
  full: { ok: 1597, fail: 2584 },
  reduced: { ok: 987, fail: 1597 },
} as const

export const RESULT_CHIP: Record<SubmitResultView['kind'], string> = {
  ok: '✓',
  BASE_IS_NOT_PRIME: '✗ 合成数',
  FACT_CONTAIN_NOT_PRIME: '✗ 素因数でない数',
  INCORRECT_ANSWER: '✗ 計算が合わない',
}

/**
 * Index (among number groups) of the first base factor that is not prime. Exponents are
 * skipped. Only call after the server result.
 */
export function findOffendingIndex(factor: SubmitResultView['factor']): number | undefined {
  if (!factor) {
    return undefined
  }
  for (const t of typesetExpr(factor)) {
    if (t.kind !== 'num' || t.exponent) {
      continue
    }
    const f = factorize(Number(t.value))
    if (f === null || f.length !== 1) {
      return t.index
    }
  }
  return undefined
}

/** The value of number group `index` in a factor expression. */
export function groupValue(factor: SubmitResultView['factor'], index: number | undefined) {
  if (!factor || index === undefined) {
    return null
  }
  const t = typesetExpr(factor).find((x) => x.kind === 'num' && x.index === index)
  return t && t.kind === 'num' ? t.value : null
}

/** `=` whose slash draws in, turning it into `≠` (#22). */
function NeqMorph({ full }: { full: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-neq=""
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="var(--danger)"
      strokeWidth={2}
      strokeLinecap="round"
      className="inline-block align-[-0.1em]"
    >
      <path d="M5 9.5h14M5 14.5h14" />
      <m.path
        d="M15.5 4.5L8.5 19.5"
        initial={full ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={full ? { duration: DUR.md, ease: EASE.out, delay: DUR.lg } : { duration: 0 }}
      />
    </svg>
  )
}

function Chip({
  tone,
  children,
  pop,
}: { tone: 'danger' | 'prime'; children: string; pop?: boolean }) {
  const mode = useMotionMode()
  const preset = motionPreset(mode === 'reduced')
  return (
    <m.span
      data-chip={tone}
      className="num inline-flex items-center rounded-[var(--r-1)] px-fib-2 font-bold leading-tight"
      style={{
        fontSize: 'var(--fs--1)',
        color: tone === 'danger' ? 'var(--danger)' : 'var(--prime)',
        border: '1.5px solid currentColor',
        minHeight: 22,
      }}
      variants={preset.pop}
      initial={pop ? 'hidden' : false}
      animate="show"
    >
      {children}
    </m.span>
  )
}

function Body({ result, full }: { result: SubmitResultView; full: boolean }) {
  // factorization: computed from the post-result props only
  const factors = useMemo(
    () => (result.kind === 'BASE_IS_NOT_PRIME' ? factorize(result.value) : null),
    [result.kind, result.value],
  )
  const offending = useMemo(
    () =>
      result.kind === 'FACT_CONTAIN_NOT_PRIME'
        ? (result.offendingIndex ?? findOffendingIndex(result.factor))
        : undefined,
    [result.kind, result.offendingIndex, result.factor],
  )

  switch (result.kind) {
    case 'ok': {
      const withFactor = result.factor && result.factor.length > 0
      return (
        <>
          <span className="relative inline-flex flex-col items-center overflow-hidden px-fib-2">
            <span className="inline-flex items-baseline gap-fib-2">
              <NumberGlyph value={result.value} size={4} tone="prime" />
              {withFactor ? (
                <span className="num text-ink" style={{ fontSize: 'var(--fs-2)' }}>
                  = <Expr tokens={result.factor ?? []} />
                </span>
              ) : (
                <span className="num" style={{ fontSize: 'var(--fs-2)', color: 'var(--prime)' }}>
                  ∈ ℙ
                </span>
              )}
            </span>
            <m.span
              aria-hidden="true"
              data-underline=""
              className="mt-fib-1 block h-[2px] w-full rounded-full"
              style={{ background: 'var(--prime)', originX: 0 }}
              initial={full ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={full ? { duration: DUR.md, ease: EASE.out } : { duration: 0 }}
            />
            {full ? (
              <m.span
                aria-hidden="true"
                data-shimmer=""
                className="pointer-events-none absolute inset-y-0 w-1/2"
                style={{
                  left: 0,
                  background:
                    'linear-gradient(100deg, transparent 0%, color-mix(in srgb, var(--surface) 70%, transparent) 50%, transparent 100%)',
                }}
                initial={{ x: '-100%' }}
                animate={{ x: '220%' }}
                transition={{ duration: DUR.xxl, ease: EASE.inOut, delay: DUR.sm }}
              />
            ) : null}
          </span>
          <Chip tone="prime">{RESULT_CHIP.ok}</Chip>
        </>
      )
    }
    case 'BASE_IS_NOT_PRIME':
      return (
        <>
          {factors !== null && factors.length <= 1 ? (
            // 0, 1 (and anything without a split) have no tree
            <span className="num font-bold text-ink" style={{ fontSize: 'var(--fs-3)' }}>
              {result.value} <span style={{ color: 'var(--danger)' }}>∉ ℙ</span>
            </span>
          ) : (
            <FactorTree value={result.value} factors={factors} animate={full} />
          )}
          <Chip tone="danger" pop={true}>
            {RESULT_CHIP.BASE_IS_NOT_PRIME}
          </Chip>
        </>
      )
    case 'FACT_CONTAIN_NOT_PRIME': {
      const bad = groupValue(result.factor, offending)
      return (
        <>
          <span
            className="num inline-flex items-baseline gap-fib-2 text-ink"
            style={{ fontSize: 'var(--fs-2)' }}
          >
            <span className="font-bold">{result.value}</span>
            <span style={{ color: 'var(--ink-muted)' }}>=</span>
            <Expr tokens={result.factor ?? []} highlightIndex={offending} />
          </span>
          {bad !== null ? (
            <m.span
              data-not-prime-box=""
              className="num inline-flex items-baseline gap-fib-1 rounded-[var(--r-1)] px-fib-2 font-bold"
              style={{
                fontSize: 'var(--fs-1)',
                color: 'var(--danger)',
                outline: '2px solid var(--danger)',
                outlineOffset: 1,
              }}
              initial={full ? { scale: 1 } : false}
              animate={full ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: DUR.md, ease: EASE.out, delay: DUR.md }}
            >
              {bad} ∉ℙ
            </m.span>
          ) : null}
          <Chip tone="danger" pop={true}>
            {RESULT_CHIP.FACT_CONTAIN_NOT_PRIME}
          </Chip>
        </>
      )
    }
    case 'INCORRECT_ANSWER':
      return (
        <>
          <span
            className="num inline-flex items-baseline gap-fib-2 text-ink"
            style={{ fontSize: 'var(--fs-2)' }}
          >
            <span className="font-bold">{result.value}</span>
            <NeqMorph full={full} />
            <Expr tokens={result.factor ?? []} />
            <span className="sr-only">≠</span>
          </span>
          {result.evaluated !== undefined ? (
            <span
              data-evaluated={result.evaluated}
              className="num"
              style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}
            >
              右辺 = {result.evaluated}
            </span>
          ) : null}
          <Chip tone="danger" pop={true}>
            {RESULT_CHIP.INCORRECT_ANSWER}
          </Chip>
        </>
      )
    default:
      return null
  }
}

export function ResultOverlay({ result, onDone }: ResultOverlayProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // fire onDone once per result after its hold
  useEffect(() => {
    if (!result) {
      return
    }
    const hold = RESULT_HOLD_MS[mode][result.kind === 'ok' ? 'ok' : 'fail']
    const id = setTimeout(() => doneRef.current?.(), hold)
    return () => clearTimeout(id)
  }, [result, mode])

  return (
    <AnimatePresence>
      {result ? (
        <m.output
          key={`${result.kind}-${result.value}-${result.submitter}`}
          aria-live="polite"
          data-result={result.kind}
          data-motion={mode}
          onClick={() => doneRef.current?.()}
          className="absolute inset-0 flex cursor-pointer items-center justify-center p-fib-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: full ? DUR.md : DUR.sm, ease: EASE.in } }}
          transition={{ duration: full ? DUR.md : DUR.sm, ease: EASE.out }}
        >
          <m.div
            className="flex max-w-full flex-col items-center gap-fib-2 rounded-[var(--r-3)] px-fib-4 py-fib-3"
            style={{
              background: 'color-mix(in srgb, var(--surface-raised) 92%, transparent)',
              boxShadow: 'var(--shadow-2)',
              backdropFilter: 'blur(2px)',
            }}
            initial={full ? { y: 8, scale: 0.96 } : false}
            animate={{ y: 0, scale: 1 }}
            transition={
              full ? { type: 'spring', visualDuration: DUR.lg, bounce: 0 } : { duration: 0 }
            }
          >
            <span style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}>
              {result.submitter} の提出
            </span>
            <Body result={result} full={full} />
            {result.kind !== 'ok' && result.penalty > 0 ? (
              <m.span
                data-penalty={result.penalty}
                className="num rounded-[var(--r-1)] px-fib-2 font-bold"
                style={{
                  fontSize: 'var(--fs-0)',
                  color: 'var(--on-prime)',
                  background: 'var(--danger)',
                }}
                initial={full ? { opacity: 0, y: 0 } : false}
                animate={full ? { opacity: [0, 1, 1], y: [6, 0, -4] } : { opacity: 1 }}
                transition={
                  full ? { duration: DUR.xl, delay: DUR.xl, ease: EASE.out } : { duration: 0 }
                }
              >
                +{result.penalty} 枚
              </m.span>
            ) : null}
          </m.div>
        </m.output>
      ) : null}
    </AnimatePresence>
  )
}
