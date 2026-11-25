/**
 * Raster versions of the brand mark (`app/icon.svg`, an Ulam spiral with the primes lit) for
 * the apple-touch-icon and the PWA manifest. The SVG is embedded as a data URI, so the PNGs
 * always match the favicon.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Dark `--bg`: the mark's own background, used to fill the square edge to edge. */
export const ICON_BG = '#0D0F13'

export async function brandMarkDataUri(): Promise<string> {
  const svg = await readFile(join(process.cwd(), 'src/app/icon.svg'))
  return `data:image/svg+xml;base64,${svg.toString('base64')}`
}

type BrandIconProps = {
  src: string
  size: number
  /** share of the square the mark covers: 1 for a plain icon, 0.8 keeps a maskable safe zone */
  scale?: number
}

/** A full-bleed square (no transparent corners, which iOS and Android would fill) with the mark. */
export function BrandIcon({ src, size, scale = 1 }: BrandIconProps) {
  const inner = Math.round(size * scale)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: ICON_BG,
      }}
    >
      <img src={src} alt="" width={inner} height={inner} />
    </div>
  )
}
