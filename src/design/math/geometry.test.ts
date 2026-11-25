import { describe, expect, it } from 'vitest'
import {
  PHI,
  arcLift,
  arcPoint,
  bezierArc,
  clipPathPolygon,
  cubicBezierEase,
  ellipsePoint,
  fanLayout,
  fitSpiral,
  flightKeyframes,
  lineNormal,
  lineSide,
  logSpiral,
  phyllotaxis,
  polygonArea,
  ringPoint,
  scaleKeyframes,
  seatAngle,
  spiralDirection,
  spiralPoint,
  splitRectByLine,
  timerDash,
} from './geometry'

describe('seatAngle', () => {
  it('puts self at π/2', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(seatAngle(0, n)).toBeCloseTo(Math.PI / 2)
    }
  })
  it('spaces seats evenly', () => {
    for (const n of [2, 3, 4]) {
      const angles = Array.from({ length: n }, (_, k) => seatAngle(k, n))
      for (let k = 1; k < n; k++) {
        expect(angles[k] - angles[k - 1]).toBeCloseTo((2 * Math.PI) / n)
      }
    }
  })
  it('guards n = 0', () => {
    expect(Number.isFinite(seatAngle(1, 0))).toBe(true)
  })
})

describe('ellipsePoint / ringPoint', () => {
  it('ellipsePoint', () => {
    const p = ellipsePoint(10, 5, Math.PI / 2)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(5)
  })
  it('ringPoint, optionally snapped to n ticks', () => {
    const p = ringPoint(2, 0)
    expect(p).toEqual({ x: 2, y: 0 })
    const snapped = ringPoint(1, 0.2, 4)
    expect(snapped.x).toBeCloseTo(1)
    expect(snapped.y).toBeCloseTo(0)
  })
})

describe('fanLayout', () => {
  it('is symmetric', () => {
    const { items, mode } = fanLayout({ n: 7, W: 700, cardW: 60 })
    expect(mode).toBe('fan')
    for (let i = 0; i < items.length; i++) {
      const j = items.length - 1 - i
      expect(items[i].rotate).toBeCloseTo(-items[j].rotate)
      expect(items[i].y).toBeCloseTo(items[j].y)
      expect(items[i].x + 30).toBeCloseTo(700 - (items[j].x + 30))
    }
    expect(items[3].rotate).toBeCloseTo(0)
  })
  it('caps the step at w + 8', () => {
    expect(fanLayout({ n: 3, W: 2000, cardW: 60 }).step).toBe(68)
  })
  it('centres a single card', () => {
    expect(fanLayout({ n: 1, W: 300, cardW: 60 }).items).toEqual([{ x: 120, y: 0, rotate: 0 }])
    expect(fanLayout({ n: 0, W: 300, cardW: 60 }).items).toEqual([])
  })
  it('switches to scroll below the slice threshold', () => {
    const layout = fanLayout({ n: 30, W: 400, cardW: 60 })
    expect(layout.mode).toBe('scroll')
    expect(layout.step).toBeGreaterThanOrEqual(32)
    expect(layout.items.every((it) => it.rotate === 0)).toBe(true)
  })
  it('is never wider than W in fan mode for n in [1, 52]', () => {
    for (const W of [360, 756, 1440]) {
      for (let n = 1; n <= 52; n++) {
        const cardW = 0.6886 * 100
        const { mode, items } = fanLayout({ n, W, cardW })
        if (mode === 'fan') {
          const left = Math.min(...items.map((i) => i.x))
          const right = Math.max(...items.map((i) => i.x)) + cardW
          expect(left).toBeGreaterThanOrEqual(-1e-9)
          expect(right).toBeLessThanOrEqual(W + 1e-9)
        }
      }
    }
  })
  it('limits per-card rotation to min(2.5°, 20°/n)', () => {
    const { items } = fanLayout({ n: 11, W: 1400, cardW: 60 })
    expect(items[1].rotate - items[0].rotate).toBeCloseTo(20 / 11)
  })
})

describe('timerDash', () => {
  it('is 0 at full and C at zero', () => {
    expect(timerDash(60, 60, 100)).toBe(0)
    expect(timerDash(0, 60, 100)).toBe(100)
    expect(timerDash(30, 60, 100)).toBe(50)
  })
  it('clamps negatives and overflow', () => {
    expect(timerDash(-5, 60, 100)).toBe(100)
    expect(timerDash(90, 60, 100)).toBe(0)
    expect(timerDash(5, 0, 100)).toBe(100)
  })
})

describe('bezierArc', () => {
  it('has exact endpoints and lifts the middle', () => {
    const { x, y } = bezierArc({ x: 0, y: 100 }, { x: 200, y: 100 }, 40)
    expect(x).toHaveLength(9)
    expect([x[0], y[0]]).toEqual([0, 100])
    expect([x[8], y[8]]).toEqual([200, 100])
    expect(y[4]).toBeCloseTo(80) // quadratic peak = half the control lift
  })
})

describe('logSpiral', () => {
  it('shrinks the radius by φ per quarter turn and ends at the centre', () => {
    const to = { x: 10, y: 10 }
    const perQuarter = 4
    const { x, y } = logSpiral({ from: { x: 110, y: 10 }, to, turns: 1, perQuarter })
    const radius = (i: number) => Math.hypot(x[i] - to.x, y[i] - to.y)
    for (let q = 1; q <= 4; q++) {
      expect(radius((q - 1) * perQuarter) / radius(q * perQuarter)).toBeCloseTo(PHI)
    }
    expect(x.at(-1)).toBe(10)
    expect(y.at(-1)).toBe(10)
    expect([x[0], y[0]]).toEqual([110, 10])
  })
})

describe('phyllotaxis', () => {
  it('scale = φ^−age', () => {
    expect(phyllotaxis(0, 10)).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1 })
    expect(phyllotaxis(2, 10).scale).toBeCloseTo(PHI ** -2)
    expect(phyllotaxis(20, 10).opacity).toBe(0.4)
    const p = phyllotaxis(4, 10)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(20)
  })
})

describe('cubicBezierEase', () => {
  it('has exact endpoints and is monotone for the travel ease', () => {
    const f = cubicBezierEase([0.65, 0, 0.35, 1])
    expect(f(0)).toBe(0)
    expect(f(1)).toBe(1)
    let prev = 0
    for (let i = 1; i <= 50; i++) {
      const v = f(i / 50)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
    // symmetric ease-in-out passes through the middle
    expect(f(0.5)).toBeCloseTo(0.5, 3)
  })
  it('is the identity for the linear curve', () => {
    const f = cubicBezierEase([0, 0, 1, 1])
    for (const t of [0.1, 0.3, 0.77]) {
      expect(f(t)).toBeCloseTo(t, 4)
    }
  })
  it('matches a known point of ease-out', () => {
    // cubic-bezier(0.22, 1, 0.36, 1) is well past half way at t = 0.25
    expect(cubicBezierEase([0.22, 1, 0.36, 1])(0.25)).toBeGreaterThan(0.6)
  })
})

describe('arcPoint / spiralPoint', () => {
  const from = { x: 10, y: 200 }
  const to = { x: 310, y: 40 }
  it('arcPoint agrees with bezierArc samples', () => {
    const arc = bezierArc(from, to, 40, 4)
    for (let i = 0; i <= 4; i++) {
      const p = arcPoint(from, to, 40, i / 4)
      expect(p.x).toBeCloseTo(arc.x[i])
      expect(p.y).toBeCloseTo(arc.y[i])
    }
  })
  it('arcPoint rises above the chord by lift/2 at the apex', () => {
    const p = arcPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 40, 0.5)
    expect(p).toEqual({ x: 50, y: -20 })
  })
  it('spiralPoint starts at from, ends exactly at the centre', () => {
    const a = spiralPoint(from, to, 1, 0)
    expect(a.x).toBeCloseTo(from.x)
    expect(a.y).toBeCloseTo(from.y)
    expect(spiralPoint(from, to, 1, 1)).toEqual({ x: to.x, y: to.y })
  })
  it('spiralPoint shrinks by φ per quarter turn (before the closing quarter)', () => {
    const r0 = Math.hypot(from.x - to.x, from.y - to.y)
    // 1 turn = 4 quarters; t = 0.25 is one quarter turn, t = 0.5 two
    for (const [t, q] of [
      [0.25, 1],
      [0.5, 2],
      [0.75, 3],
    ] as const) {
      const p = spiralPoint(from, to, 1, t)
      expect(Math.hypot(p.x - to.x, p.y - to.y)).toBeCloseTo(r0 * PHI ** -q, 6)
    }
  })
  it('spiralPoint radius never grows', () => {
    let prev = Number.POSITIVE_INFINITY
    for (let i = 0; i <= 40; i++) {
      const p = spiralPoint(from, to, 0.75, i / 40)
      const r = Math.hypot(p.x - to.x, p.y - to.y)
      expect(r).toBeLessThanOrEqual(prev + 1e-9)
      prev = r
    }
  })
})

describe('arcLift', () => {
  it('clamps to [24, 96]', () => {
    expect(arcLift(0)).toBe(24)
    expect(arcLift(10_000)).toBe(96)
    expect(arcLift(300)).toBeCloseTo(300 / PHI ** 3)
  })
})

describe('flightKeyframes', () => {
  const from = { x: 20, y: 400 }
  const to = { x: 500, y: 120 }
  it('arc: exact endpoints, uniform times, final rotation', () => {
    const k = flightKeyframes({ from, to, path: { kind: 'arc', lift: 40 }, steps: 10, toRotate: 3 })
    expect(k.x).toHaveLength(11)
    expect(k.times[0]).toBe(0)
    expect(k.times[10]).toBe(1)
    expect([k.x[0], k.y[0], k.x[10], k.y[10]]).toEqual([from.x, from.y, to.x, to.y])
    expect(k.rotate[0]).toBe(0)
    expect(k.rotate[10]).toBe(3)
    for (const r of k.rotate) {
      expect(Math.abs(r)).toBeLessThanOrEqual(15)
    }
  })
  it('arc: with a linear ease the samples lie on bezierArc', () => {
    const k = flightKeyframes({
      from,
      to,
      path: { kind: 'arc', lift: 40 },
      steps: 8,
      ease: [0, 0, 1, 1],
    })
    const arc = bezierArc(from, to, 40, 8)
    for (let i = 0; i <= 8; i++) {
      expect(k.x[i]).toBeCloseTo(arc.x[i], 3)
      expect(k.y[i]).toBeCloseTo(arc.y[i], 3)
    }
  })
  it('arc: the eased path starts slow (travel ease)', () => {
    const k = flightKeyframes({ from, to, path: { kind: 'arc', lift: 0 }, steps: 10 })
    const first = Math.hypot(k.x[1] - k.x[0], k.y[1] - k.y[0])
    const mid = Math.hypot(k.x[6] - k.x[5], k.y[6] - k.y[5])
    expect(first).toBeLessThan(mid)
  })
  it('spiral: ends at the centre after turns·360° of spin', () => {
    const k = flightKeyframes({ from, to, path: { kind: 'spiral', turns: 1 }, steps: 16 })
    expect(k.x.at(-1)).toBe(to.x)
    expect(k.y.at(-1)).toBe(to.y)
    expect(k.rotate.at(-1)).toBe(360)
    for (let i = 1; i < k.rotate.length; i++) {
      expect(k.rotate[i]).toBeGreaterThanOrEqual(k.rotate[i - 1])
    }
  })
})

describe('scaleKeyframes', () => {
  it('runs from s0 to s1 on the eased progress', () => {
    const s = scaleKeyframes(1, 0.5, 6)
    expect(s).toHaveLength(7)
    expect(s[0]).toBe(1)
    expect(s[6]).toBe(0.5)
  })
})

describe('splitRectByLine (57 cut)', () => {
  // the slash of the cut overlay: bottom-left → top-right of a 400 × 200 box
  const a = { x: 32, y: 184 }
  const b = { x: 368, y: 16 }
  it('puts the top-left corner on the negative side', () => {
    expect(lineSide(a, b, { x: 0, y: 0 })).toBeLessThan(0)
    expect(lineSide(a, b, { x: 400, y: 200 })).toBeGreaterThan(0)
    const n = lineNormal(a, b)
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1)
    // the normal points to the positive (lower-right) side
    expect(lineSide(a, b, { x: 200 + n.x * 10, y: 100 + n.y * 10 })).toBeGreaterThan(0)
  })
  it('splits a centred card into two halves whose areas add up', () => {
    const card = { x: 170, y: 60, w: 60, h: 87 }
    const { neg, pos } = splitRectByLine(card, a, b)
    expect(neg.length).toBeGreaterThanOrEqual(3)
    expect(pos.length).toBeGreaterThanOrEqual(3)
    expect(polygonArea(neg) + polygonArea(pos)).toBeCloseTo(card.w * card.h, 6)
    // rect-local coordinates
    for (const p of [...neg, ...pos]) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9)
      expect(p.x).toBeLessThanOrEqual(card.w + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(-1e-9)
      expect(p.y).toBeLessThanOrEqual(card.h + 1e-9)
    }
  })
  it('one side is empty when the line misses the rect', () => {
    const card = { x: 0, y: 0, w: 20, h: 20 } // far top-left of the slash
    const { neg, pos } = splitRectByLine(card, a, b)
    expect(polygonArea(neg)).toBeCloseTo(400)
    expect(pos).toEqual([])
  })
  it('neighbouring cards are cut along one continuous line', () => {
    const left = { x: 120, y: 60, w: 60, h: 87 }
    const right = { x: 184, y: 60, w: 60, h: 87 }
    const cutPoints = (r: typeof left) =>
      splitRectByLine(r, a, b)
        .neg.map((p) => ({ x: p.x + r.x, y: p.y + r.y }))
        .filter((p) => Math.abs(lineSide(a, b, p)) < 1e-6)
    for (const p of [...cutPoints(left), ...cutPoints(right)]) {
      expect(lineSide(a, b, p)).toBeCloseTo(0, 6)
    }
    expect(cutPoints(left).length).toBe(2)
    expect(cutPoints(right).length).toBe(2)
  })
})

describe('clipPathPolygon', () => {
  it('formats percentages and guards degenerate input', () => {
    expect(
      clipPathPolygon(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 0, y: 100 },
        ],
        50,
        100,
      ),
    ).toBe('polygon(0% 0%, 100% 0%, 0% 100%)')
    expect(clipPathPolygon([], 10, 10)).toBe('polygon(0 0, 0 0, 0 0)')
  })
})

describe('spiralDirection', () => {
  const bounds = { x: 0, y: 0, w: 1440, h: 900 }
  it('turns away from the near edge', () => {
    // field left of a deck near the top edge: clockwise would sweep up off-screen
    const from = { x: 630, y: 340 }
    const deckHigh = { x: 1371, y: 150 }
    expect(spiralDirection(from, deckHigh, 0.75, bounds)).toBe(-1)
    // the same deck near the bottom: clockwise (up first) is the roomy way
    const deckLow = { x: 1371, y: 780 }
    expect(spiralDirection(from, deckLow, 0.75, bounds)).toBe(1)
  })
  it('mirrors spiralPoint', () => {
    const from = { x: 100, y: 0 }
    const to = { x: 0, y: 0 }
    const cw = spiralPoint(from, to, 1, 0.25, 1)
    const ccw = spiralPoint(from, to, 1, 0.25, -1)
    expect(cw.x).toBeCloseTo(ccw.x)
    expect(cw.y).toBeCloseTo(-ccw.y)
    expect(cw.y).toBeGreaterThan(0) // clockwise on screen: right → down
  })
})

describe('fitSpiral', () => {
  const bounds = { x: 0, y: 0, w: 1440, h: 900 }
  it('keeps the full sweep when there is room', () => {
    const from = { x: 300, y: 450 }
    const deck = { x: 720, y: 450 }
    expect(fitSpiral(from, deck, bounds)).toEqual({ turns: 0.75, dir: 1 })
  })
  it('shortens to a hook for a deck by the right edge', () => {
    // the wide table: field centre-left, deck at the right edge
    const from = { x: 607, y: 326 }
    const deck = { x: 1371, y: 326 }
    const fit = fitSpiral(from, deck, bounds)
    expect(fit.turns).toBeLessThan(0.75)
    for (let i = 0; i <= 16; i++) {
      const p = spiralPoint(from, deck, fit.turns, i / 16, fit.dir)
      expect(p.x).toBeLessThanOrEqual(1440)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(900)
    }
  })
})
