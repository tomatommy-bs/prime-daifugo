/**
 * The 1200 × 630 share card (Open Graph and Twitter), drawn by `next/og` in the Sieve Table
 * style: paper background, ink title, and a 1…100 sieve where the 25 primes are filled
 * vermilion squares and the composites stay grey dots (design spec §1: primes glow).
 *
 * Satori supports a subset of CSS: every element with children sets `display: flex`.
 */
import { sieve } from '@/design/math/sieve'
import { SITE_HOST } from '@/lib/site'

/** Light-scheme tokens from globals.css (the card has no dark variant). */
const C = {
  bg: '#F6F4EE',
  surface: '#FFFFFF',
  ink: '#15171C',
  muted: '#585D69',
  line: '#DDD9CE',
  composite: '#C9C5B9',
  prime: '#B3361B',
  onPrime: '#FFFFFF',
} as const

const MONO = 'Geist Mono, Noto Sans JP'
const SANS = 'Noto Sans JP, Geist Mono'

const GRID = { n: 100, cols: 10, cell: 36, gap: 6 } as const

export type SieveCell = { k: number; prime: boolean }

/** Cells 1…n with their primality, in reading order. */
export function sieveCells(n: number = GRID.n): SieveCell[] {
  const flags = sieve(n)
  return Array.from({ length: n }, (_, i) => ({ k: i + 1, prime: flags[i + 1] === true }))
}

function Cell({ k, prime }: SieveCell) {
  const box = {
    width: GRID.cell,
    height: GRID.cell,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
  if (prime) {
    return (
      <div
        style={{
          ...box,
          background: C.prime,
          borderRadius: 6,
          color: C.onPrime,
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 17,
        }}
      >
        {String(k)}
      </div>
    )
  }
  return (
    <div style={box}>
      <div style={{ width: 7, height: 7, borderRadius: 7, background: C.composite }} />
    </div>
  )
}

function SieveBoard() {
  const cells = sieveCells()
  const rows = Array.from({ length: GRID.n / GRID.cols }, (_, r) =>
    cells.slice(r * GRID.cols, (r + 1) * GRID.cols),
  )
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: GRID.gap,
        padding: 24,
        background: C.surface,
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        boxShadow: '0 1px 2px rgba(21,23,28,0.10), 0 5px 13px rgba(21,23,28,0.08)',
      }}
    >
      {rows.map((row) => (
        <div key={row[0]?.k} style={{ display: 'flex', gap: GRID.gap }}>
          {row.map((cell) => (
            <Cell key={cell.k} {...cell} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The card. Its fonts are subsets holding only the characters drawn here: when the copy
 * changes, refetch them (fonts/README.md); `fonts.test.tsx` fails on any missing glyph.
 */
export function OgCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: C.bg,
        color: C.ink,
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
          paddingRight: 48,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: '0.12em',
            color: C.muted,
          }}
        >
          PRIME DAIFUGŌ
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: '0.06em',
              lineHeight: 1.236,
            }}
          >
            素数大富豪
          </div>
          <div
            style={{
              display: 'flex',
              width: 89,
              height: 4,
              marginTop: 20,
              marginBottom: 28,
              background: C.prime,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.5,
              color: C.muted,
            }}
          >
            <span>素数を出し合う</span>
            <span>オンライン対戦カードゲーム</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: MONO,
            fontWeight: 500,
            fontSize: 24,
            color: C.ink,
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 3, background: C.prime }} />
          {SITE_HOST}
        </div>
      </div>
      <SieveBoard />
    </div>
  )
}
