/**
 * Colour tokens mirrored from `src/app/globals.css` (the source of truth, spec §2.1).
 * `tokens.test.ts` parses globals.css and checks these values and their WCAG contrast.
 */

export const TOKEN_NAMES = [
  'bg',
  'surface',
  'surface-raised',
  'ink',
  'ink-muted',
  'line',
  'composite',
  'border-strong',
  'prime',
  'on-prime',
  'factor',
  'mod',
  'gold',
  'danger',
  'card-face',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]
export type Scheme = 'light' | 'dark'

export const TOKENS: Record<Scheme, Record<TokenName, string>> = {
  light: {
    bg: '#F6F4EE',
    surface: '#FFFFFF',
    'surface-raised': '#FFFFFF',
    ink: '#15171C',
    'ink-muted': '#585D69',
    line: '#DDD9CE',
    composite: '#C9C5B9',
    'border-strong': '#878B95',
    prime: '#B3361B',
    'on-prime': '#FFFFFF',
    factor: '#0E6E66',
    mod: '#4338CA',
    gold: '#8A5A00',
    danger: '#B42318',
    'card-face': '#FFFFFF',
  },
  dark: {
    bg: '#0D0F13',
    surface: '#161920',
    'surface-raised': '#1F232C',
    ink: '#ECE9E2',
    'ink-muted': '#A2A7B2',
    line: '#2A2F3A',
    composite: '#3A404D',
    'border-strong': '#6E7483',
    prime: '#FF8A5C',
    'on-prime': '#0D0F13',
    factor: '#2DD4BF',
    mod: '#A5B4FC',
    gold: '#F5C542',
    danger: '#F87171',
    'card-face': '#FFFFFF', // cards stay white in dark mode
  },
}

/** Seat hues: golden angle `h = 200° + k·137.508°` in OKLCH (§2.1). Index = playOrder index. */
export const SEAT_HUES: Record<Scheme, readonly [string, string, string, string]> = {
  light: ['#00767E', '#8D457B', '#626A00', '#2865A5'],
  dark: ['#64D1D7', '#E8A5D5', '#BBC679', '#8FC2FD'],
}

/** Tokens used as text: each must reach 4.5:1 on bg, surface and surface-raised. */
export const TEXT_TOKENS = ['ink', 'ink-muted', 'prime', 'factor', 'mod', 'gold', 'danger'] as const

/** Non-text UI tokens (interactive borders): each must reach 3:1. */
export const UI_TOKENS = ['border-strong'] as const

/** CSS custom property reference, e.g. `cssVar('prime')` → `var(--prime)`. */
export const cssVar = (name: TokenName | `seat-${0 | 1 | 2 | 3}`) => `var(--${name})`

/** `var(--seat-k)` for a playOrder index (wraps modulo 4). */
export const seatHueVar = (k: number) => `var(--seat-${((k % 4) + 4) % 4})`

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance of a `#RRGGBB` (or `#RGB`) colour. */
export function luminance(hex: string): number {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`invalid hex colour: ${hex}`)
  }
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio between two hex colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
