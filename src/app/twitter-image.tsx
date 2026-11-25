import { OG_ALT, OG_SIZE } from '@/lib/site'
import { ImageResponse } from 'next/og'
import { loadOgFonts } from './_og/fonts'
import { OgCard } from './_og/og-card'

export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

/** Same card as `opengraph-image` (X reads `twitter:image` first). */
export default async function Image() {
  return new ImageResponse(<OgCard />, { ...OG_SIZE, fonts: await loadOgFonts() })
}
