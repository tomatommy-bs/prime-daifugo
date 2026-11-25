'use client'

import { m } from 'framer-motion'
import { memo } from 'react'
import { ulamCells } from './math/ulam'
import { DUR, useMotionMode } from './motion'

export type UlamFieldProps = {
  /** odd side length; even values are rounded up */
  side: number
  /** cell size in px, default 8 */
  cell?: number
  primeColor?: string
  dotColor?: string
  /** fade cells in by spiral index (stagger 2 ms, total ≤ 987 ms) */
  reveal?: boolean
  className?: string
}

/** Decorative Ulam spiral (§6.1): primes as squares, composites as dots. Always aria-hidden. */
function UlamFieldImpl({
  side,
  cell = 8,
  primeColor = 'var(--prime)',
  dotColor = 'var(--composite)',
  reveal = false,
  className,
}: UlamFieldProps) {
  const mode = useMotionMode()
  const s = Math.max(1, Math.floor(side) | 1)
  const cells = ulamCells(s)
  const total = cells.length
  const size = s * cell
  const running = reveal && mode === 'full'
  const delayFor = (k: number) => Math.min(k * 0.002, (DUR.xxl * k) / total)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      data-motion={mode}
    >
      {cells.map((c) => {
        const x = c.col * cell
        const y = c.row * cell
        const shape = c.prime ? (
          <rect
            data-cell="prime"
            x={x + cell * 0.19}
            y={y + cell * 0.19}
            width={cell * 0.62}
            height={cell * 0.62}
            fill={primeColor}
          />
        ) : (
          <circle
            data-cell="composite"
            cx={x + cell / 2}
            cy={y + cell / 2}
            r={Math.max(0.5, cell * 0.08)}
            fill={dotColor}
          />
        )
        if (!running) {
          return <g key={c.k}>{shape}</g>
        }
        return (
          <m.g
            key={c.k}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR.sm, delay: delayFor(c.k) }}
          >
            {shape}
          </m.g>
        )
      })}
    </svg>
  )
}

export const UlamField = memo(UlamFieldImpl)
UlamField.displayName = 'UlamField'

export default UlamField
