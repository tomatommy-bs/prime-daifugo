'use client'

import { m } from 'framer-motion'
import { DUR, useMotionMode } from './motion'

export type ModRingProps = {
  /** number of ticks (ℤ/nℤ) */
  n: number
  /** ticks filled in `--mod` (loader progress) */
  filled?: number
  /** diameter in px, default 48 */
  size?: number
  /** rotate continuously (removed under reduced motion) */
  spin?: boolean
  /** accessible label; without it the ring is decorative */
  label?: string
  className?: string
}

/** A residue ring with `n` ticks (§6.1), used as loader and seat geometry hint. */
export function ModRing({
  n,
  filled = 0,
  size = 48,
  spin = false,
  label,
  className,
}: ModRingProps) {
  const mode = useMotionMode()
  const count = Math.max(1, Math.floor(n))
  const c = size / 2
  const r = size * 0.36
  const tickIn = size * 0.3
  const tickOut = size * 0.46
  const spinning = spin && mode === 'full'
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const }

  const ticks = Array.from({ length: count }, (_, k) => {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / count
    const on = k < filled
    return (
      <line
        key={k}
        data-tick={on ? 'filled' : 'empty'}
        x1={c + tickIn * Math.cos(t)}
        y1={c + tickIn * Math.sin(t)}
        x2={c + tickOut * Math.cos(t)}
        y2={c + tickOut * Math.sin(t)}
        stroke={on ? 'var(--mod)' : 'var(--border-strong)'}
        strokeWidth={on ? 2 : 1.5}
        strokeLinecap="round"
      />
    )
  })

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      data-motion={mode}
      data-spin={spinning ? 'true' : 'false'}
      {...a11y}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={1} />
      {spinning ? (
        <m.g
          style={{ originX: '50%', originY: '50%' }}
          animate={{ rotate: 360 }}
          transition={{ duration: DUR.xxxl * 2, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
        >
          {ticks}
        </m.g>
      ) : (
        <g>{ticks}</g>
      )}
    </svg>
  )
}

export default ModRing
