import { ImageResponse } from 'next/og'
import { BrandIcon, brandMarkDataUri } from './_og/brand-icon'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** apple-touch-icon: the favicon mark as a 180 × 180 PNG (iOS ignores SVG icons). */
export default async function AppleIcon() {
  return new ImageResponse(<BrandIcon src={await brandMarkDataUri()} size={size.width} />, size)
}
