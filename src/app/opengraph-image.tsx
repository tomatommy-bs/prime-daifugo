import { OG_ALT, OG_SIZE } from '@/lib/site'
import { ImageResponse } from 'next/og'
import { loadOgFonts } from './_og/fonts'
import { OgCard } from './_og/og-card'

export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

/** The share card for every page (pages inherit it unless a segment adds its own). */
export default async function Image() {
  return new ImageResponse(<OgCard />, { ...OG_SIZE, fonts: await loadOgFonts() })
}
