'use client'

import { SPRING, useMotionMode } from '@/design/motion'
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@/shared/name'
import { m } from 'framer-motion'

export type NameLengthMeterProps = {
  /** current number of characters */
  length: number
  /** shortest valid length (default NAME_MIN_LENGTH) */
  min?: number
  /** longest valid length; also the number of ticks (default NAME_MAX_LENGTH) */
  max?: number
  className?: string
}

export type NameLengthState = 'empty' | 'short' | 'ok' | 'long'

export const nameLengthState = (
  length: number,
  min = NAME_MIN_LENGTH,
  max = NAME_MAX_LENGTH,
): NameLengthState => {
  if (length <= 0) {
    return 'empty'
  }
  if (length < min) {
    return 'short'
  }
  if (length > max) {
    return 'long'
  }
  return 'ok'
}

/**
 * A 10-tick length gauge for the player name (§7.2).
 *
 * - Ticks below the minimum are drawn hollow and dashed until filled, so the threshold
 *   reads without colour.
 * - Filled ticks are `--mod`; out of range they turn `--danger` and the readout gains ✗.
 */
export function NameLengthMeter({
  length,
  min = NAME_MIN_LENGTH,
  max = NAME_MAX_LENGTH,
  className,
}: NameLengthMeterProps) {
  const mode = useMotionMode()
  const state = nameLengthState(length, min, max)
  const bad = state === 'short' || state === 'long'
  const tone = bad ? 'var(--danger)' : 'var(--mod)'
  const filledCount = Math.min(Math.max(length, 0), max)

  return (
    <div
      role="meter"
      aria-label="名前の文字数"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(length, 0)}
      aria-valuetext={`${length} / ${max} 文字（${min}〜${max} 文字）`}
      data-state={state}
      data-motion={mode}
      className={['flex items-center gap-fib-3', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => {
          const index = i + 1
          const filled = index <= filledCount
          const belowMin = index < min
          return (
            <span
              key={index}
              data-tick={filled ? 'filled' : belowMin ? 'below-min' : 'empty'}
              className="relative block h-[14px] w-[7px] overflow-hidden"
              style={{
                borderRadius: 1.5,
                border: filled
                  ? `1px solid ${tone}`
                  : belowMin
                    ? '1px dashed var(--border-strong)'
                    : '1px solid var(--line)',
              }}
            >
              <m.span
                className="absolute inset-0 block"
                style={{ background: tone, originY: 1 }}
                initial={false}
                animate={{ scaleY: filled ? 1 : 0 }}
                transition={mode === 'reduced' ? { duration: 0 } : SPRING.snap}
              />
            </span>
          )
        })}
      </div>
      <span
        className="num text-[length:var(--fs--1)] font-semibold leading-none"
        style={{ color: bad ? 'var(--danger)' : 'var(--ink-muted)' }}
        aria-hidden="true"
      >
        <span style={{ color: bad ? 'var(--danger)' : 'var(--ink)' }}>{length}</span> / {max}
        {bad ? <span className="ml-fib-1">✗</span> : null}
        {state === 'ok' ? (
          <span className="ml-fib-1" style={{ color: 'var(--mod)' }}>
            ✓
          </span>
        ) : null}
      </span>
      <span
        className="text-[length:var(--fs--1)] leading-none"
        style={{ color: bad ? 'var(--danger)' : 'var(--ink-muted)' }}
        aria-hidden="true"
      >
        {min}〜{max} 文字
      </span>
    </div>
  )
}

export default NameLengthMeter
