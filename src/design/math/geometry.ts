/** Geometry helpers for seats, the hand fan, timers and flight paths (spec §6.1, §7.5). */

export const PHI = (1 + Math.sqrt(5)) / 2
export const GOLDEN_ANGLE_DEG = 137.50776405003785
const TAU = Math.PI * 2

export type Point = { x: number; y: number }

/** Angle of seat `k` of `n` around the table. Self (k = 0) is at π/2 (bottom, screen
 * coordinates), and play proceeds clockwise on screen. */
export function seatAngle(k: number, n: number): number {
  const count = Math.max(1, n)
  return Math.PI / 2 + (TAU * k) / count
}

/** Point on an ellipse with semi-axes `a` (x) and `b` (y), centred at the origin. */
export function ellipsePoint(a: number, b: number, theta: number): Point {
  return { x: a * Math.cos(theta), y: b * Math.sin(theta) }
}

/** Point on a circle of radius `r`. With `n`, `theta` snaps to the nearest of `n` ticks. */
export function ringPoint(r: number, theta: number, n?: number): Point {
  let t = theta
  if (n !== undefined && n > 0) {
    const step = TAU / n
    t = Math.round(theta / step) * step
  }
  return { x: r * Math.cos(t), y: r * Math.sin(t) }
}

export type FanItem = { x: number; y: number; rotate: number }
export type FanLayout = { mode: 'fan' | 'scroll'; step: number; items: FanItem[] }

/**
 * Hand layout (§7.5). Card width `cardW`, container width `W`.
 * - `step = clamp(0.38w, (W − w)/(n − 1), w + 8)`
 * - arc: `θᵢ = (i − (n−1)/2)·δ`, `δ = min(maxDeg, 20°/n)`, `yᵢ = R(1 − cos θᵢ)`, `R = 4W`
 * - when the raw step falls below `max(32px, 0.38w)` the hand becomes a scroll-snap row.
 * `x` is each card's left edge; `rotate` is in degrees.
 */
export function fanLayout({
  n,
  W,
  cardW,
  maxDeg = 2.5,
}: {
  n: number
  W: number
  cardW: number
  maxDeg?: number
}): FanLayout {
  const count = Math.max(0, Math.floor(n))
  if (count === 0) {
    return { mode: 'fan', step: 0, items: [] }
  }
  const minSlice = Math.max(32, 0.38 * cardW)
  if (count === 1) {
    return { mode: 'fan', step: 0, items: [{ x: Math.max(0, (W - cardW) / 2), y: 0, rotate: 0 }] }
  }
  const raw = (W - cardW) / (count - 1)
  if (raw < minSlice) {
    const step = minSlice
    return {
      mode: 'scroll',
      step,
      items: Array.from({ length: count }, (_, i) => ({ x: i * step, y: 0, rotate: 0 })),
    }
  }
  const step = Math.min(Math.max(0.38 * cardW, raw), cardW + 8)
  const total = (count - 1) * step + cardW
  const left = (W - total) / 2
  const delta = Math.min(maxDeg, 20 / count)
  const R = 4 * W
  const mid = (count - 1) / 2
  const items = Array.from({ length: count }, (_, i) => {
    const deg = (i - mid) * delta
    const rad = (deg * Math.PI) / 180
    return { x: left + i * step, y: R * (1 - Math.cos(rad)), rotate: deg }
  })
  return { mode: 'fan', step, items }
}

/** `strokeDashoffset` of a timer ring of circumference `C`: 0 when full, `C` at zero.
 * Negative or overflowing times clamp. */
export function timerDash(left: number, total: number, C: number): number {
  if (!(total > 0)) {
    return C
  }
  const clamped = Math.min(Math.max(left, 0), total)
  return C * (1 - clamped / total)
}

/** Quadratic Bézier from `from` to `to` whose control point is lifted by `lift` px (up on
 * screen). Returns `steps + 1` samples with exact endpoints. */
export function bezierArc(
  from: Point,
  to: Point,
  lift: number,
  steps = 8,
): { x: number[]; y: number[] } {
  const n = Math.max(1, Math.floor(steps))
  const cx = (from.x + to.x) / 2
  const cy = (from.y + to.y) / 2 - lift
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    x.push(u * u * from.x + 2 * u * t * cx + t * t * to.x)
    y.push(u * u * from.y + 2 * u * t * cy + t * t * to.y)
  }
  x[0] = from.x
  y[0] = from.y
  x[n] = to.x
  y[n] = to.y
  return { x, y }
}

/**
 * Logarithmic spiral from `from` into `to` (the centre). The radius shrinks by φ per quarter
 * turn: `r(θ) = r₀·φ^(−θ/(π/2))`. Samples `perQuarter` points per quarter turn over `turns`
 * turns, then ends exactly at `to`.
 */
export function logSpiral({
  from,
  to,
  turns = 1,
  perQuarter = 4,
}: {
  from: Point
  to: Point
  turns?: number
  perQuarter?: number
}): { x: number[]; y: number[] } {
  const dx = from.x - to.x
  const dy = from.y - to.y
  const r0 = Math.hypot(dx, dy)
  const a0 = Math.atan2(dy, dx)
  const quarters = Math.max(0, turns * 4)
  const samples = Math.max(1, Math.round(quarters * perQuarter))
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= samples; i++) {
    const q = (i / samples) * quarters // quarter turns travelled
    const r = r0 * PHI ** -q
    const a = a0 + q * (Math.PI / 2)
    x.push(to.x + r * Math.cos(a))
    y.push(to.y + r * Math.sin(a))
  }
  x[0] = from.x
  y[0] = from.y
  x.push(to.x)
  y.push(to.y)
  return { x, y }
}

/**
 * Vogel phyllotaxis placement for the `age`-th older field value (age 0 = newest).
 * Angle = age · golden angle, radius = c·√age, scale = φ^−age.
 */
export function phyllotaxis(
  age: number,
  c: number,
): { x: number; y: number; scale: number; opacity: number } {
  const a = Math.max(0, age)
  const theta = (a * GOLDEN_ANGLE_DEG * Math.PI) / 180
  const r = c * Math.sqrt(a)
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    scale: PHI ** -a,
    opacity: Math.max(0.4, PHI ** (-a / 2)),
  }
}
