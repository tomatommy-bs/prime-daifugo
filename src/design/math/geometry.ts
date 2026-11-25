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

/* ------------------------------------------------------------------ */
/* Card flights (§9.2 #7, #11, #19, #23, #24) and the 57 cut (#25)     */
/* ------------------------------------------------------------------ */

export type CubicBezier = readonly [number, number, number, number]

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time `t ∈ [0, 1]` → progress. Solved
 * with Newton steps and a bisection fallback; the endpoints are exact.
 */
export function cubicBezierEase([x1, y1, x2, y2]: CubicBezier): (t: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  return (t: number) => {
    if (t <= 0) {
      return 0
    }
    if (t >= 1) {
      return 1
    }
    let s = t
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t
      if (Math.abs(err) < 1e-6) {
        return sampleY(s)
      }
      const d = slopeX(s)
      if (Math.abs(d) < 1e-6) {
        break
      }
      s -= err / d
    }
    let lo = 0
    let hi = 1
    s = t
    for (let i = 0; i < 32; i++) {
      const x = sampleX(s)
      if (Math.abs(x - t) < 1e-6) {
        break
      }
      if (x < t) {
        lo = s
      } else {
        hi = s
      }
      s = (lo + hi) / 2
    }
    return sampleY(s)
  }
}

/** Point at parameter `t` of the quadratic arc used by `bezierArc`. */
export function arcPoint(from: Point, to: Point, lift: number, t: number): Point {
  const cx = (from.x + to.x) / 2
  const cy = (from.y + to.y) / 2 - lift
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  }
}

/**
 * Point at parameter `t` of a logarithmic spiral from `from` into the centre `to` over
 * `turns` turns. The radius shrinks by φ per quarter turn; whatever radius is left after
 * the last turn is closed linearly over the final quarter of the parameter, so `t = 1`
 * lands exactly on `to` without a jump.
 */
export function spiralPoint(
  from: Point,
  to: Point,
  turns: number,
  t: number,
  dir: 1 | -1 = 1,
): Point {
  const dx = from.x - to.x
  const dy = from.y - to.y
  const r0 = Math.hypot(dx, dy)
  const a0 = Math.atan2(dy, dx)
  const quarters = Math.max(0, turns * 4)
  const q = t * quarters
  const close = t <= 0.75 ? 1 : 1 - (t - 0.75) / 0.25 // fade out the residual radius
  const r = r0 * PHI ** -q * close
  const a = a0 + dir * q * (Math.PI / 2)
  return { x: to.x + r * Math.cos(a), y: to.y + r * Math.sin(a) }
}

/** Smallest distance (px, negative when outside) from a spiral's samples to `bounds`. */
export function spiralMargin(
  from: Point,
  to: Point,
  turns: number,
  dir: 1 | -1,
  bounds: Rect,
): number {
  let worst = Number.POSITIVE_INFINITY
  for (let i = 1; i <= 16; i++) {
    const p = spiralPoint(from, to, turns, i / 16, dir)
    worst = Math.min(
      worst,
      p.x - bounds.x,
      bounds.x + bounds.w - p.x,
      p.y - bounds.y,
      bounds.y + bounds.h - p.y,
    )
  }
  return worst
}

/**
 * Which way a spiral from `from` into `to` should turn (1: clockwise on screen) so that it
 * stays inside `bounds`: the direction whose sweep keeps the larger margin wins.
 */
export function spiralDirection(from: Point, to: Point, turns: number, bounds: Rect): 1 | -1 {
  return spiralMargin(from, to, turns, 1, bounds) >= spiralMargin(from, to, turns, -1, bounds)
    ? 1
    : -1
}

/**
 * The widest spiral (most turns of `candidates`, then the roomier direction) that stays on
 * screen. A deck near an edge gets a shorter hook instead of a sweep off the viewport; when
 * nothing fits, the smallest candidate with the larger margin is used.
 */
export function fitSpiral(
  from: Point,
  to: Point,
  bounds: Rect,
  candidates: readonly number[] = [0.75, 0.5, 0.25],
): { turns: number; dir: 1 | -1 } {
  const sorted = [...candidates].sort((a, b) => b - a)
  for (const turns of sorted) {
    const dir = spiralDirection(from, to, turns, bounds)
    if (spiralMargin(from, to, turns, dir, bounds) >= 0) {
      return { turns, dir }
    }
  }
  const turns = sorted.at(-1) ?? 0.25
  return { turns, dir: spiralDirection(from, to, turns, bounds) }
}

/** Arc lift for a flight of length `d`: d/φ³ clamped to [24, 96] px (draws use 40). */
export function arcLift(d: number): number {
  return Math.min(96, Math.max(24, d / PHI ** 3))
}

export type FlightPath =
  | { kind: 'arc'; lift: number }
  /** `dir`: 1 turns clockwise on screen (default), −1 counter-clockwise */
  | { kind: 'spiral'; turns: number; dir?: 1 | -1 }

export type FlightKeyframes = {
  x: number[]
  y: number[]
  /** degrees */
  rotate: number[]
  /** uniform keyframe offsets in [0, 1]; play them with `ease: 'linear'` */
  times: number[]
}

/**
 * Transform keyframes for one card flight. Positions are sampled at eased progress so the
 * whole path is eased once (framer would otherwise ease every segment); play them with
 * `ease: 'linear'` and these `times`. Rotation tilts with the horizontal velocity on arcs
 * (max ±12°) and ends at `toRotate`; on spirals the card turns once per spiral turn and
 * ends at `toRotate + turns·360°`.
 */
export function flightKeyframes({
  from,
  to,
  path,
  steps = 12,
  ease = [0.65, 0, 0.35, 1],
  fromRotate = 0,
  toRotate = 0,
}: {
  from: Point
  to: Point
  path: FlightPath
  steps?: number
  ease?: CubicBezier
  fromRotate?: number
  toRotate?: number
}): FlightKeyframes {
  const n = Math.max(2, Math.floor(steps))
  const easeFn = cubicBezierEase(ease)
  const x: number[] = []
  const y: number[] = []
  const rotate: number[] = []
  const times: number[] = []
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const p = easeFn(u)
    const pt =
      path.kind === 'arc'
        ? arcPoint(from, to, path.lift, p)
        : spiralPoint(from, to, path.turns, p, path.dir ?? 1)
    x.push(pt.x)
    y.push(pt.y)
    times.push(u)
    const base = fromRotate + (toRotate - fromRotate) * p
    if (path.kind === 'arc') {
      // tilt into the direction of travel, strongest mid-flight
      const tilt = Math.max(-12, Math.min(12, ((to.x - from.x) / d) * 12))
      rotate.push(base + tilt * Math.sin(Math.PI * p))
    } else {
      // the card turns with the sweep: one revolution per spiral turn
      rotate.push(base + (path.dir ?? 1) * p * path.turns * 360)
    }
  }
  x[0] = from.x
  y[0] = from.y
  x[n] = to.x
  y[n] = to.y
  rotate[0] = fromRotate
  rotate[n] = toRotate + (path.kind === 'spiral' ? (path.dir ?? 1) * path.turns * 360 : 0)
  return { x, y, rotate, times }
}

/** Ghost scale keyframes from `s0` to `s1`, sampled on the same eased progress as the path. */
export function scaleKeyframes(
  s0: number,
  s1: number,
  steps = 12,
  ease: CubicBezier = [0.65, 0, 0.35, 1],
): number[] {
  const n = Math.max(2, Math.floor(steps))
  const easeFn = cubicBezierEase(ease)
  return Array.from({ length: n + 1 }, (_, i) => s0 + (s1 - s0) * easeFn(i / n))
}

/** Signed side of `p` against the directed line `a → b` (< 0: left on screen when a→b
 * points right-up, i.e. the upper-left side of the 57 slash). */
export function lineSide(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

/** Unit normal of `a → b` pointing to the positive side of `lineSide`. */
export function lineNormal(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  return { x: -dy / l, y: dx / l }
}

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Split the rectangle `r` by the infinite line through `a` and `b` (all in the same
 * coordinates). Returns the two polygons in **rect-local** px (origin at the rect's top-left):
 * `neg` lies on the `lineSide < 0` side, `pos` on the other. A side the line misses is `[]`.
 * Used for the 57 cut, where one slash splits every field card into two halves.
 */
export function splitRectByLine(r: Rect, a: Point, b: Point): { neg: Point[]; pos: Point[] } {
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
  const clip = (keepNeg: boolean): Point[] => {
    const out: Point[] = []
    const inside = (p: Point) => (keepNeg ? lineSide(a, b, p) <= 0 : lineSide(a, b, p) >= 0)
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i]
      const q = corners[(i + 1) % corners.length]
      const pin = inside(p)
      const qin = inside(q)
      if (pin) {
        out.push(p)
      }
      if (pin !== qin) {
        const sp = lineSide(a, b, p)
        const sq = lineSide(a, b, q)
        const t = sp / (sp - sq)
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
      }
    }
    const local = out.map((p) => ({ x: p.x - r.x, y: p.y - r.y }))
    // a sliver of zero area (line through a corner or along an edge) is no half
    return polygonArea(local) > 1e-6 ? local : []
  }
  return { neg: clip(true), pos: clip(false) }
}

/** Absolute area of a simple polygon (shoelace). */
export function polygonArea(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

/** CSS `clip-path` for a rect-local polygon on a `w × h` box, in percentages. */
export function clipPathPolygon(poly: Point[], w: number, h: number): string {
  if (poly.length < 3 || !(w > 0) || !(h > 0)) {
    return 'polygon(0 0, 0 0, 0 0)'
  }
  const pct = (v: number, of: number) => `${Math.round((v / of) * 10000) / 100}%`
  return `polygon(${poly.map((p) => `${pct(p.x, w)} ${pct(p.y, h)}`).join(', ')})`
}
