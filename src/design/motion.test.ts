import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockMatchMedia } from '../test-utils'
import {
  DUR,
  EASE,
  SPRING,
  dampedShake,
  motionPreset,
  shakeEnvelope,
  stagger,
  useMotionMode,
  useMotionPreset,
  variants,
} from './motion'

const FIB_MS = new Set([89, 144, 233, 377, 610, 987, 1597])

/** Collect every duration-like number in a nested transition/variant object. */
const durations = (value: unknown, out: number[] = []): number[] => {
  if (Array.isArray(value)) {
    for (const v of value) durations(v, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'duration' || k === 'visualDuration' || k === 'delay') && typeof v === 'number') {
        out.push(v)
      } else {
        durations(v, out)
      }
    }
  }
  return out
}

const springTypes = (value: unknown, out: string[] = []): string[] => {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'type' && typeof v === 'string') out.push(v)
      else springTypes(v, out)
    }
  }
  return out
}

describe('motion tokens', () => {
  it('DUR values are Fibonacci milliseconds', () => {
    for (const s of Object.values(DUR)) {
      expect(FIB_MS.has(Math.round(s * 1000))).toBe(true)
    }
  })
  it('springs are described by visualDuration and bounce', () => {
    for (const s of Object.values(SPRING)) {
      expect(s.type).toBe('spring')
      expect(FIB_MS.has(Math.round(s.visualDuration * 1000))).toBe(true)
      expect(s.bounce).toBeGreaterThanOrEqual(0)
    }
    expect(EASE.out).toHaveLength(4)
  })
})

describe('dampedShake', () => {
  it('starts and ends at exactly 0', () => {
    const frames = dampedShake()
    expect(frames).toHaveLength(13)
    expect(frames[0]).toBe(0)
    expect(frames.at(-1)).toBe(0)
    expect(frames.some((f) => f !== 0)).toBe(true)
  })
  it('stays within a monotonically non-increasing envelope', () => {
    const opts = { A: 10, lambda: 6, duration: 0.377, n: 21 }
    const frames = dampedShake(opts)
    let prevEnv = Number.POSITIVE_INFINITY
    frames.forEach((f, i) => {
      const t = (i / (frames.length - 1)) * opts.duration
      const env = shakeEnvelope(t, opts.A, opts.lambda)
      expect(env).toBeLessThanOrEqual(prevEnv)
      expect(Math.abs(f)).toBeLessThanOrEqual(env + 1e-3)
      prevEnv = env
    })
  })
  it('clamps n to at least 2 samples', () => {
    expect(dampedShake({ n: 1 })).toEqual([0, 0])
  })
})

describe('stagger', () => {
  it('stagger(count) · count ≤ 1.2', () => {
    for (let count = 0; count <= 120; count++) {
      expect(stagger(count) * Math.max(1, count)).toBeLessThanOrEqual(1.2 + 1e-12)
    }
    expect(stagger(3)).toBe(0.055)
    expect(stagger(100)).toBeCloseTo(0.012)
  })
})

describe('motionPreset', () => {
  it('reduced: every duration ≤ .144 and no springs or shakes', () => {
    const preset = motionPreset(true)
    expect(preset.mode).toBe('reduced')
    const all = durations({ ...preset, digit: preset.digit(1) })
    expect(all.length).toBeGreaterThan(0)
    for (const d of all) {
      expect(d).toBeLessThanOrEqual(0.144)
    }
    expect(springTypes({ ...preset, digit: preset.digit(1) })).not.toContain('spring')
    expect(preset.shake.x).toEqual([0])
  })
  it('full: maps to the shared variants', () => {
    const preset = motionPreset(false)
    expect(preset.mode).toBe('full')
    expect(preset.fadeUp).toBe(variants.fadeUp)
    expect(preset.stamp).toBe(variants.stamp)
    expect(preset.digit(-1)).toMatchObject({ initial: { y: '-100%' }, exit: { y: '100%' } })
    expect(variants.shake.x[0]).toBe(0)
  })
})

describe('useMotionMode', () => {
  it('reports full by default and reduced when the OS asks', () => {
    mockMatchMedia({ '(prefers-reduced-motion: reduce)': false })
    expect(renderHook(() => useMotionMode()).result.current).toBe('full')
    mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    expect(renderHook(() => useMotionMode()).result.current).toBe('reduced')
    expect(renderHook(() => useMotionPreset()).result.current.reduced).toBe(true)
  })
})
