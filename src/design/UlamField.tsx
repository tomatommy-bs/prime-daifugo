'use client'

import { m } from 'framer-motion'
import { memo, useMemo } from 'react'
import { ulamCells } from './math/ulam'
import { DUR, EASE, useMotionMode } from './motion'

export type UlamFieldProps = {
  /** odd side length; even values are rounded up */
  side: number
  /** cell size in px, default 8 */
  cell?: number
  primeColor?: string
  dotColor?: string
  /** reveal from the centre outwards (one clip-path animation, 987 ms) */
  reveal?: boolean
  className?: string
}

export type UlamGeometry = {
  size: number
  /** one path of squares, one per prime */
  primes: string
  /** one path of dots, one per composite */
  dots: string
  primeCount: number
  dotCount: number
}

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * The whole field as two path strings (like the card back's `BACK_GEOMETRY`): a 55×55
 * backdrop used to be ~6k SVG nodes, each with its own motion component.
 */
export function ulamGeometry(side: number, cell: number): UlamGeometry {
  const s = Math.max(1, Math.floor(side) | 1)
  const sq = r2(cell * 0.62)
  const inset = cell * 0.19
  const r = r2(Math.max(0.5, cell * 0.08))
  const primes: string[] = []
  const dots: string[] = []
  for (const c of ulamCells(s)) {
    const x = c.col * cell
    const y = c.row * cell
    if (c.prime) {
      primes.push(`M${r2(x + inset)} ${r2(y + inset)}h${sq}v${sq}h${-sq}z`)
    } else {
      const cx = r2(x + cell / 2 - r)
      const cy = r2(y + cell / 2)
      dots.push(`M${cx} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0`)
    }
  }
  return {
    size: s * cell,
    primes: primes.join(''),
    dots: dots.join(''),
    primeCount: primes.length,
    dotCount: dots.length,
  }
}

const HIDDEN = 'circle(0% at 50% 50%)'
const SHOWN = 'circle(71% at 50% 50%)' // reaches the corners of the square

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
  const g = useMemo(() => ulamGeometry(side, cell), [side, cell])
  const running = reveal && mode === 'full'

  return (
    <m.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${g.size} ${g.size}`}
      width={g.size}
      height={g.size}
      aria-hidden="true"
      className={className}
      data-motion={mode}
      data-reveal={running ? 'true' : undefined}
      // the spiral grows from its centre, so a widening circle reads as the spiral revealing
      initial={running ? { clipPath: HIDDEN } : false}
      animate={running ? { clipPath: SHOWN } : undefined}
      transition={{ duration: DUR.xxl, ease: EASE.out }}
    >
      <path data-cell="composite" data-count={g.dotCount} d={g.dots} fill={dotColor} />
      <path data-cell="prime" data-count={g.primeCount} d={g.primes} fill={primeColor} />
    </m.svg>
  )
}

export const UlamField = memo(UlamFieldImpl)
UlamField.displayName = 'UlamField'

export default UlamField
