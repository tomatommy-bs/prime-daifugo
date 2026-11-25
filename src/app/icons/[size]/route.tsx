import { ImageResponse } from 'next/og'
import { BrandIcon, brandMarkDataUri } from '../../_og/brand-icon'

/**
 * PNG icons for the web app manifest: `/icons/192.png`, `/icons/512.png` and the maskable
 * `/icons/maskable-512.png` (the mark shrunk into the 80 % safe zone). Prerendered at build.
 */
const PWA_ICONS = {
  '192.png': { size: 192, scale: 1 },
  '512.png': { size: 512, scale: 1 },
  'maskable-512.png': { size: 512, scale: 0.8 },
} as const

type IconName = keyof typeof PWA_ICONS

export const dynamicParams = false

export function generateStaticParams(): { size: IconName }[] {
  return (Object.keys(PWA_ICONS) as IconName[]).map((size) => ({ size }))
}

export async function GET(_request: Request, { params }: { params: { size: string } }) {
  const icon = PWA_ICONS[params.size as IconName]
  if (!icon) {
    return new Response('Not found', { status: 404 })
  }
  return new ImageResponse(
    <BrandIcon src={await brandMarkDataUri()} size={icon.size} scale={icon.scale} />,
    { width: icon.size, height: icon.size },
  )
}
