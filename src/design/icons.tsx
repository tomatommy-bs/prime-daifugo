/**
 * Custom mathematical glyphs (spec §5): inline SVG on a 24 grid, 1.5 stroke, round caps,
 * `currentColor`. Decorative (`aria-hidden`) unless `title` is passed.
 */
import type { CSSProperties, ReactNode, SVGProps } from 'react'

export { IconQrcode, IconRotate2, IconSunMoon } from '@tabler/icons-react'

export type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'stroke'> & {
  size?: number | string
  title?: string
  stroke?: number
  className?: string
  style?: CSSProperties
}

function Glyph({
  size = '1.25em',
  title,
  stroke = 1.5,
  children,
  ...rest
}: GlyphProps & { children: ReactNode }) {
  const a11y = title ? { role: 'img' as const } : { 'aria-hidden': true as const }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** `·` multiplication dot */
export const IconTimes = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </Glyph>
)

/** `xʸ` power */
export const IconPow = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 10l7 9M11 10l-7 9" />
    <path d="M14 4l2.5 3.5M19 4l-4.5 7" />
  </Glyph>
)

/** `∴` therefore (log) */
export const IconTherefore = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="6.5" r="1.6" fill="currentColor" />
    <circle cx="6" cy="17.5" r="1.6" fill="currentColor" />
    <circle cx="18" cy="17.5" r="1.6" fill="currentColor" />
  </Glyph>
)

/** `∎` Q.E.D. tombstone */
export const IconQed = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="6" y="5" width="12" height="14" rx="0.5" fill="currentColor" />
  </Glyph>
)

/** `≠` */
export const IconNeq = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 9h14M5 15h14M16 4L8 20" />
  </Glyph>
)

/** `≟` questioned equality */
export const IconQEq = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 15h14M5 20h14" />
    <path d="M9.5 6a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </Glyph>
)

/** `∅` empty set (pass) */
export const IconEmpty = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M18 4L6 20" />
  </Glyph>
)

/** Circle with `n` ticks (ℤ/nℤ) */
export const IconModRing = ({ n = 4, ...p }: GlyphProps & { n?: number }) => {
  const ticks = Array.from({ length: Math.max(1, n) }, (_, k) => {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, n)
    const x1 = 12 + 6 * Math.cos(t)
    const y1 = 12 + 6 * Math.sin(t)
    const x2 = 12 + 9.5 * Math.cos(t)
    const y2 = 12 + 9.5 * Math.sin(t)
    return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
  })
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="6" />
      {ticks}
    </Glyph>
  )
}

/** 3×3 sieve grid with one struck-out cell */
export const IconSieve = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16" />
    <path d="M10.5 15.8l3-2.3" />
  </Glyph>
)

/** Square spiral (Ulam) */
export const IconSpiral = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 12h2v-2h-4v4h6v-6h-8v8h10V6H6" />
  </Glyph>
)

/** Binary split (factor tree) */
export const IconTree = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="5" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M11 6.8L7 16.2M13 6.8l4 9.4" />
  </Glyph>
)

/** `▲` lead marker */
export const IconLead = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 6l7 12H5z" fill="currentColor" />
  </Glyph>
)

/** `+1` over a card outline (引く) */
export const IconDrawCard = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="5" y="7" width="10" height="14" rx="1.5" />
    <path d="M17 3v6M14 6h6" />
  </Glyph>
)

/** `↑` into a bracket (出す) */
export const IconSubmit = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M5 14v5h14v-5" />
  </Glyph>
)
