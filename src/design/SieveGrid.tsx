'use client'

import { m } from 'framer-motion'
import { memo, useMemo } from 'react'
import { primesUpTo, sieve, strikingPrime } from './math/sieve'
import { DUR, EASE, useMotionMode } from './motion'

export type SieveGridProps = {
  /** cells 1 … n, default 100 */
  n?: number
  /** columns, default 10 */
  cols?: number
  /** run the strike-out passes (ignored under reduced motion) */
  animate?: boolean
  /** strike-out passes, default [2, 3, 5, 7] */
  passes?: number[]
  /** cell size in px, default 12 */
  size?: number
  /** prime fill opacity: 0.25 on home, 1 on loading (default) */
  primeOpacity?: number
  'aria-hidden'?: boolean
  className?: string
}

const PASS_GAP = DUR.sm // 144 ms between passes

/**
 * A sieve of Eratosthenes (§6.1). Primes are filled squares in `--prime`; composites are
 * hollow dots in `--composite`. With `animate`, each pass strikes its multiples.
 */
function SieveGridImpl({
  n = 100,
  cols = 10,
  animate = false,
  passes = [2, 3, 5, 7],
  size = 12,
  primeOpacity = 1,
  'aria-hidden': ariaHidden = true,
  className,
}: SieveGridProps) {
  const mode = useMotionMode()
  const running = animate && mode === 'full'
  const passKey = passes.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: passKey stands in for passes
  const cells = useMemo(() => {
    const flags = sieve(n)
    return Array.from({ length: Math.max(0, n) }, (_, i) => {
      const k = i + 1
      return {
        k,
        col: i % cols,
        row: Math.floor(i / cols),
        prime: flags[k] === true,
        striker: strikingPrime(k, passes),
      }
    })
  }, [n, cols, passKey])

  const rows = Math.ceil(Math.max(0, n) / cols)
  const width = cols * size
  const height = rows * size
  const half = size / 2
  const passIndex = (p: number | null) => (p === null ? -1 : passes.indexOf(p))
  const delayFor = (p: number | null) => passIndex(p) * (DUR.md + PASS_GAP)

  const a11y = ariaHidden
    ? { 'aria-hidden': true as const }
    : {
        role: 'img' as const,
        'aria-label': `1 から ${n} までのふるい（素数 ${primesUpTo(n).length} 個）`,
      }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      data-motion={mode}
      data-animate={running ? 'true' : 'false'}
      {...a11y}
    >
      {cells.map((c) => {
        const x = c.col * size
        const y = c.row * size
        if (c.prime) {
          const inset = size * 0.18
          return (
            <rect
              key={c.k}
              data-cell="prime"
              x={x + inset}
              y={y + inset}
              width={size - 2 * inset}
              height={size - 2 * inset}
              rx={size * 0.08}
              fill="var(--prime)"
              fillOpacity={primeOpacity}
            />
          )
        }
        const dot = (
          <circle
            data-cell={c.k === 1 ? 'unit' : 'composite'}
            cx={x + half}
            cy={y + half}
            r={size * 0.14}
            fill="none"
            stroke="var(--composite)"
            strokeWidth={1}
          />
        )
        if (!running || c.striker === null) {
          return <g key={c.k}>{dot}</g>
        }
        return (
          <g key={c.k}>
            {dot}
            <m.line
              data-strike={c.striker}
              x1={x + size * 0.2}
              y1={y + size * 0.8}
              x2={x + size * 0.8}
              y2={y + size * 0.2}
              stroke="var(--composite)"
              strokeWidth={1}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DUR.md, ease: EASE.out, delay: delayFor(c.striker) }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export const SieveGrid = memo(SieveGridImpl)
SieveGrid.displayName = 'SieveGrid'

export default SieveGrid
