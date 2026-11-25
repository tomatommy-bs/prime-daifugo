import { describe, expect, it } from 'vitest'
import {
  PHI,
  bezierArc,
  ellipsePoint,
  fanLayout,
  logSpiral,
  phyllotaxis,
  ringPoint,
  seatAngle,
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
