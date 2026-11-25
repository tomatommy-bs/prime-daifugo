import { ulamCells } from '@/design/math/ulam'
import type { SVGProps } from 'react'

/**
 * Card back (spec §8.2): a 21×21 Ulam spiral (k = 1 … 441) inside a double-rule frame.
 * Primes are filled squares, composites faint dots, and the centre "1" is the only accent.
 * The geometry is generated once at module load and shared by every back.
 */

const W = 201.58
const H = 282.22
const SIDE = 21
const INK = '#15171C'
const RULE = '#ECE9E2'
const ACCENT = '#FF8A5C'

const OUTER_INSET = 8
const INNER_INSET = 12
const PAD = 7
const GRID = W - 2 * (INNER_INSET + PAD)
const CELL = GRID / SIDE
const X0 = INNER_INSET + PAD
const Y0 = (H - GRID) / 2

const r2 = (v: number) => Math.round(v * 100) / 100

type BackGeometry = { primes: string; dots: string; centre: string; primeCount: number }

function buildGeometry(): BackGeometry {
  const square = CELL * 0.62
  const inset = (CELL - square) / 2
  const dot = 0.9
  const primes: string[] = []
  const dots: string[] = []
  let centre = ''
  for (const cell of ulamCells(SIDE)) {
    const x = X0 + cell.col * CELL
    const y = Y0 + cell.row * CELL
    const cx = x + CELL / 2
    const cy = y + CELL / 2
    if (cell.k === 1) {
      const d = CELL * 0.42
      centre = `M${r2(cx)} ${r2(cy - d)}L${r2(cx + d)} ${r2(cy)}L${r2(cx)} ${r2(cy + d)}L${r2(cx - d)} ${r2(cy)}Z`
    } else if (cell.prime) {
      primes.push(`M${r2(x + inset)} ${r2(y + inset)}h${r2(square)}v${r2(square)}h${r2(-square)}z`)
    } else {
      dots.push(
        `M${r2(cx - dot)} ${r2(cy)}a${dot} ${dot} 0 1 0 ${2 * dot} 0a${dot} ${dot} 0 1 0 ${-2 * dot} 0`,
      )
    }
  }
  return { primes: primes.join(''), dots: dots.join(''), centre, primeCount: primes.length }
}

/** Memoised spiral paths (one `d` string per layer keeps the DOM small). */
export const BACK_GEOMETRY: BackGeometry = buildGeometry()

const ruleY = [r2(Y0 - 9), r2(Y0 + GRID + 9)]

const SvgBack = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 201.58 282.22"
    width="0.69em"
    height="1em"
    data-back="ulam"
    {...props}
  >
    <title>山札</title>
    <path
      d="M201.58 10.08A10.08 10.08 0 0 0 191.5 0H10.08A10.08 10.08 0 0 0 0 10.08v262.06a10.08 10.08 0 0 0 10.08 10.08H191.5a10.08 10.08 0 0 0 10.08-10.08z"
      fill={INK}
    />
    <rect
      x={OUTER_INSET}
      y={OUTER_INSET}
      width={W - 2 * OUTER_INSET}
      height={H - 2 * OUTER_INSET}
      rx={4}
      fill="none"
      stroke={RULE}
      strokeWidth={1.5}
    />
    <rect
      x={INNER_INSET}
      y={INNER_INSET}
      width={W - 2 * INNER_INSET}
      height={H - 2 * INNER_INSET}
      rx={2}
      fill="none"
      stroke={RULE}
      strokeWidth={0.75}
    />
    {ruleY.map((y) => (
      <line
        key={y}
        x1={X0}
        x2={r2(X0 + GRID)}
        y1={y}
        y2={y}
        stroke={RULE}
        strokeOpacity={0.5}
        strokeWidth={0.75}
      />
    ))}
    <path d={BACK_GEOMETRY.dots} fill={RULE} fillOpacity={0.25} data-layer="composite" />
    <path d={BACK_GEOMETRY.primes} fill={RULE} data-layer="prime" />
    <path d={BACK_GEOMETRY.centre} fill={ACCENT} data-layer="one" />
  </svg>
)
export default SvgBack
