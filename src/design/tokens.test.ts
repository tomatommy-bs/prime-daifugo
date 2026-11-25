import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  SEAT_HUES,
  type Scheme,
  TEXT_TOKENS,
  TOKENS,
  TOKEN_NAMES,
  UI_TOKENS,
  contrast,
  cssVar,
  luminance,
  seatHueVar,
} from './tokens'

const SCHEMES: Scheme[] = ['light', 'dark']
const GROUNDS = ['bg', 'surface', 'surface-raised'] as const

/** Parse `--name:#HEX` declarations of one CSS block. */
const parseBlock = (css: string, selector: string): Record<string, string> => {
  const start = css.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\b/g)) {
    out[m[1]] = m[2].toUpperCase()
  }
  return out
}

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')

describe('contrast()', () => {
  it('computes WCAG ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1)
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 5)
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5)
  })
  it('is symmetric', () => {
    expect(contrast('#B3361B', '#F6F4EE')).toBeCloseTo(contrast('#F6F4EE', '#B3361B'), 10)
  })
  it('rejects invalid colours', () => {
    expect(() => luminance('red')).toThrow()
  })
})

describe('token contrast (WCAG 2.x)', () => {
  for (const scheme of SCHEMES) {
    const t = TOKENS[scheme]
    for (const name of TEXT_TOKENS) {
      for (const ground of GROUNDS) {
        it(`${scheme}: --${name} on --${ground} ≥ 4.5`, () => {
          expect(contrast(t[name], t[ground])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
    for (const name of UI_TOKENS) {
      for (const ground of GROUNDS) {
        it(`${scheme}: --${name} on --${ground} ≥ 3`, () => {
          expect(contrast(t[name], t[ground])).toBeGreaterThanOrEqual(3)
        })
      }
    }
    it(`${scheme}: --on-prime on --prime ≥ 4.5`, () => {
      expect(contrast(t['on-prime'], t.prime)).toBeGreaterThanOrEqual(4.5)
    })
    SEAT_HUES[scheme].forEach((hue, k) => {
      it(`${scheme}: --seat-${k} on bg/surface ≥ 4.5`, () => {
        expect(contrast(hue, t.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(hue, t.surface)).toBeGreaterThanOrEqual(4.5)
      })
    })
  }
})

describe('globals.css matches tokens.ts', () => {
  const light = parseBlock(css, ':root {')
  const darkOverrides = parseBlock(css, "[data-mantine-color-scheme='dark'] {")
  const dark = { ...light, ...darkOverrides }

  it.each(TOKEN_NAMES)('--%s (light)', (name) => {
    expect(light[name]).toBe(TOKENS.light[name].toUpperCase())
  })
  it.each(TOKEN_NAMES)('--%s (dark)', (name) => {
    expect(dark[name]).toBe(TOKENS.dark[name].toUpperCase())
  })
  it('seat hues match in both schemes', () => {
    for (let k = 0; k < 4; k++) {
      expect(light[`seat-${k}`]).toBe(SEAT_HUES.light[k])
      expect(dark[`seat-${k}`]).toBe(SEAT_HUES.dark[k])
    }
  })
  it('declares no colour that tokens.ts does not know', () => {
    const known = new Set<string>([...TOKEN_NAMES, 'seat-0', 'seat-1', 'seat-2', 'seat-3'])
    for (const name of Object.keys(dark)) {
      expect(known.has(name)).toBe(true)
    }
  })
  it('has no gradient and no daisyUI', () => {
    expect(css).not.toMatch(/daisyui/)
    expect(css).not.toMatch(/linear-gradient/)
    expect(css).not.toMatch(/button-dark|vote-bg/)
  })
})

describe('helpers', () => {
  it('cssVar and seatHueVar', () => {
    expect(cssVar('prime')).toBe('var(--prime)')
    expect(seatHueVar(1)).toBe('var(--seat-1)')
    expect(seatHueVar(5)).toBe('var(--seat-1)')
    expect(seatHueVar(-1)).toBe('var(--seat-3)')
  })
})
