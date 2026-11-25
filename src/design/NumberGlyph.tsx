'use client'

import { AnimatePresence, m } from 'framer-motion'
import { memo, useEffect, useRef } from 'react'
import { motionPreset, useMotionMode } from './motion'

export type GlyphSize = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6
export type GlyphTone = 'ink' | 'muted' | 'prime' | 'gold' | 'danger' | 'factor'

export type NumberGlyphProps = {
  value: number | bigint | string | null
  /** modular type-scale step (§3), default 0 */
  size?: GlyphSize
  tone?: GlyphTone
  /** shown when `value` is null, default `—` */
  placeholder?: string
  /** screen-reader text replacing the digits */
  srLabel?: string
  /** announce changes (`aria-live="polite"`); off by default */
  live?: boolean
  className?: string
}

export const TONE_CLASS: Record<GlyphTone, string> = {
  ink: 'text-ink',
  muted: 'text-ink-muted',
  prime: 'text-prime',
  gold: 'text-gold',
  danger: 'text-danger',
  factor: 'text-factor',
}

// size -1 → var(--fs--1), 3 → var(--fs-3)
const fontSizeVar = (size: GlyphSize) => `var(--fs-${size})`

const toNumber = (v: NumberGlyphProps['value']): number | null => {
  if (v === null) {
    return null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * A tabular-mono numeral (§1, §6.1). Each changed digit rolls `y: ±100% → 0`, with the
 * direction taken from the sign of the change. `null` renders the placeholder.
 */
function NumberGlyphImpl({
  value,
  size = 0,
  tone = 'ink',
  placeholder = '—',
  srLabel,
  live = false,
  className = '',
}: NumberGlyphProps) {
  const mode = useMotionMode()
  const preset = motionPreset(mode === 'reduced')
  const prev = useRef<number | null>(toNumber(value))
  const current = toNumber(value)
  const dir: 1 | -1 = current !== null && prev.current !== null && current < prev.current ? -1 : 1
  useEffect(() => {
    prev.current = current
  }, [current])

  const classes = [
    'num tabular-nums slashed-zero font-bold leading-none inline-flex items-baseline',
    TONE_CLASS[tone],
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const style = { fontSize: fontSizeVar(size), lineHeight: 1 }
  const liveProps = live ? { 'aria-live': 'polite' as const, 'aria-atomic': true } : {}

  if (value === null) {
    return (
      <span
        className={classes}
        style={style}
        data-motion={mode}
        data-tone={tone}
        data-empty="true"
        {...liveProps}
      >
        <span aria-hidden={srLabel ? true : undefined}>{placeholder}</span>
        {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      </span>
    )
  }

  const text = String(value)
  const chars = text.split('')
  const len = chars.length

  return (
    <span
      className={classes}
      style={style}
      data-motion={mode}
      data-tone={tone}
      data-value={text}
      {...liveProps}
    >
      <span aria-hidden="true" className="inline-flex">
        {chars.map((ch, i) => {
          // Slots are keyed from the right so place values stay aligned while rolling.
          const slot = len - i
          return (
            <span
              key={slot}
              className="relative inline-block overflow-hidden"
              style={{ height: '1em' }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <m.span key={ch} className="inline-block" {...preset.digit(dir)} data-digit={ch}>
                  {ch}
                </m.span>
              </AnimatePresence>
            </span>
          )
        })}
      </span>
      <span className="sr-only">{srLabel ?? text}</span>
    </span>
  )
}

export const NumberGlyph = memo(NumberGlyphImpl)
NumberGlyph.displayName = 'NumberGlyph'

export default NumberGlyph
