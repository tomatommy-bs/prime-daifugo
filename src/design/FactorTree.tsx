'use client'

import { m } from 'framer-motion'
import { DUR, EASE, useMotionMode } from './motion'

export type FactorTreeProps = {
  value: number | bigint
  /** prime factors with multiplicity, or null when factorization was skipped */
  factors: (number | bigint)[] | null
  /** draw the branches level by level (removed under reduced motion) */
  animate?: boolean
  className?: string
}

export const FACTOR_OMITTED_TEXT = '合成数（因数分解は省略）'

type Node = { x: number; y: number; label: string; leaf: boolean }
type Edge = { x1: number; y1: number; x2: number; y2: number; level: number }

const DX = 26
const DY = 34
const PAD = 18

const product = (xs: (number | bigint)[]) =>
  xs.reduce<bigint>((acc, f) => acc * BigInt(f), BigInt(1)).toString()

/**
 * Binary split layout: the root splits into its first prime factor (left leaf) and the
 * product of the rest (right), recursively, so `221 → 13 · 17`.
 */
export function factorTreeLayout(value: number | bigint, factors: (number | bigint)[]) {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const isPrime = factors.length === 1
  nodes.push({ x: 0, y: 0, label: String(value), leaf: isPrime })
  let px = 0
  let py = 0
  for (let i = 0; i < factors.length - 1; i++) {
    const level = i + 1
    const left = { x: px - DX, y: py + DY }
    const right = { x: px + DX, y: py + DY }
    const restFactors = factors.slice(i + 1)
    nodes.push({ ...left, label: String(factors[i]), leaf: true })
    nodes.push({ ...right, label: product(restFactors), leaf: restFactors.length === 1 })
    edges.push({ x1: px, y1: py, x2: left.x, y2: left.y, level })
    edges.push({ x1: px, y1: py, x2: right.x, y2: right.y, level })
    px = right.x
    py = right.y
  }
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const minX = Math.min(...xs) - PAD
  const maxX = Math.max(...xs) + PAD
  const minY = Math.min(...ys) - PAD
  const maxY = Math.max(...ys) + PAD
  return { nodes, edges, viewBox: [minX, minY, maxX - minX, maxY - minY] as const }
}

/** `221 = 13 · 17` */
export const factorEquation = (value: number | bigint, factors: (number | bigint)[]) =>
  factors.length <= 1 ? String(value) : `${String(value)} = ${factors.map(String).join(' · ')}`

/**
 * Post-result factor tree (§9.2 #20): branches draw per level, prime leaves in `--prime`.
 * Only render this with factors computed AFTER the server result.
 */
export function FactorTree({ value, factors, animate = false, className = '' }: FactorTreeProps) {
  const mode = useMotionMode()
  if (factors === null) {
    return (
      <span className={`text-ink-muted ${className}`} data-motion={mode} data-omitted="true">
        <span className="num tabular-nums">{String(value)}</span> {FACTOR_OMITTED_TEXT}
      </span>
    )
  }
  const running = animate && mode === 'full'
  const { nodes, edges, viewBox } = factorTreeLayout(value, factors)
  const equation = factorEquation(value, factors)

  return (
    <figure className={`inline-flex flex-col items-center m-0 ${className}`} data-motion={mode}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox.join(' ')}
        width={viewBox[2]}
        height={viewBox[3]}
        aria-hidden="true"
      >
        {edges.map((e, i) =>
          running ? (
            <m.line
              // biome-ignore lint/suspicious/noArrayIndexKey: static layout
              key={i}
              data-edge={e.level}
              x1={e.x1}
              y1={e.y1 + 7}
              x2={e.x2}
              y2={e.y2 - 9}
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DUR.md, ease: EASE.out, delay: (e.level - 1) * DUR.md }}
            />
          ) : (
            <line
              // biome-ignore lint/suspicious/noArrayIndexKey: static layout
              key={i}
              data-edge={e.level}
              x1={e.x1}
              y1={e.y1 + 7}
              x2={e.x2}
              y2={e.y2 - 9}
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          ),
        )}
        {nodes.map((nd, i) => (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: static layout
            key={i}
            data-node={nd.leaf ? 'leaf' : 'inner'}
            x={nd.x}
            y={nd.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="num"
            fontWeight={700}
            fontSize={i === 0 ? 16 : 13}
            fill={nd.leaf ? 'var(--prime)' : 'var(--ink)'}
          >
            {nd.label}
          </text>
        ))}
      </svg>
      <figcaption className="num tabular-nums text-ink" style={{ fontSize: 'var(--fs--1)' }}>
        {equation}
      </figcaption>
    </figure>
  )
}

export default FactorTree
