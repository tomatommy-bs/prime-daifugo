'use client'

import { getCardInteger, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { m } from 'framer-motion'
import { useMotionMode } from './motion'

export type ExprProps = {
  tokens: FactCardId[]
  /** index of the offending factor among the number groups (0-based), boxed in --danger */
  highlightIndex?: number
  className?: string
}

export type ExprToken =
  | { kind: 'num'; value: string; exponent: boolean; index: number }
  | { kind: 'times' }
  | { kind: 'pow-pending' }

/** U+2009 thin space, U+22C5 dot operator, U+2009 thin space */
export const TIMES = ' ⋅ '

/**
 * Typeset `FactCardId[]` into tokens. Adjacent number cards join (mirroring
 * `evalFactCardIds`); `*` becomes `·`; `^` turns the next number group into an exponent.
 */
export function typesetExpr(tokens: FactCardId[]): ExprToken[] {
  const out: ExprToken[] = []
  let pendingPow = false
  let prevWasCard = false
  let index = 0
  for (const t of tokens) {
    if (isCardId(t)) {
      const digit = String(getCardInteger(t))
      const last = out.at(-1)
      if (prevWasCard && last?.kind === 'num') {
        last.value += digit
      } else {
        out.push({ kind: 'num', value: digit, exponent: pendingPow, index: index++ })
        pendingPow = false
      }
      prevWasCard = true
      continue
    }
    prevWasCard = false
    if (pendingPow) {
      // `^` followed by another operator: show the empty exponent slot
      out.push({ kind: 'pow-pending' })
      pendingPow = false
    }
    if (t === '*') {
      out.push({ kind: 'times' })
    } else {
      pendingPow = true
    }
  }
  if (pendingPow) {
    out.push({ kind: 'pow-pending' })
  }
  return out
}

/** Japanese reading, e.g. `2^3*3` → `"2 の 3 乗 掛ける 3"`. */
export function exprAriaLabel(tokens: FactCardId[]): string {
  const words: string[] = []
  for (const t of typesetExpr(tokens)) {
    if (t.kind === 'num') {
      if (t.exponent) {
        words.push('の', t.value, '乗')
      } else {
        words.push(t.value)
      }
    } else if (t.kind === 'times') {
      words.push('掛ける')
    } else {
      words.push('の', '□', '乗')
    }
  }
  return words.join(' ')
}

/** A typeset factor expression (§3). `role="math"` with a Japanese `aria-label`. */
export function Expr({ tokens, highlightIndex, className = '' }: ExprProps) {
  const mode = useMotionMode()
  const layout = mode === 'full' ? ('position' as const) : undefined
  const typeset = typesetExpr(tokens)
  return (
    <span
      role="math"
      aria-label={exprAriaLabel(tokens)}
      className={`num tabular-nums slashed-zero inline-flex items-baseline whitespace-nowrap ${className}`}
      data-motion={mode}
    >
      {typeset.map((t, i) => {
        const key = `${t.kind}-${i}`
        if (t.kind === 'times') {
          return (
            <m.span key={key} layout={layout} className="text-factor" data-token="times">
              {TIMES}
            </m.span>
          )
        }
        if (t.kind === 'pow-pending') {
          return (
            <sup
              key={key}
              className="text-factor opacity-50"
              style={{ fontSize: 'var(--fs--2)' }}
              data-token="pow-pending"
            >
              □
            </sup>
          )
        }
        const highlighted = highlightIndex === t.index
        const box = highlighted
          ? {
              'data-highlight': 'true',
              style: {
                outline: '2px solid var(--danger)',
                outlineOffset: 1,
                borderRadius: 'var(--r-1)',
              },
            }
          : {}
        if (t.exponent) {
          return (
            <m.sup
              key={key}
              layout={layout}
              className="text-factor"
              style={{ fontSize: 'var(--fs--2)' }}
              data-token="exp"
              {...box}
            >
              {t.value}
            </m.sup>
          )
        }
        return (
          <m.span key={key} layout={layout} data-token="num" {...box}>
            {t.value}
          </m.span>
        )
      })}
    </span>
  )
}

export default Expr
