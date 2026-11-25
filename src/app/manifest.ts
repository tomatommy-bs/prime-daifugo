import { SITE_NAME, SITE_TITLE } from '@/lib/site'
import type { MetadataRoute } from 'next'

/** Web app manifest (served at /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: '新たな素数との出会いを',
    lang: 'ja',
    dir: 'ltr',
    id: '/',
    start_url: '/',
    scope: '/',
    categories: ['games', 'education', 'entertainment'],
    theme_color: '#0D0F13',
    background_color: '#0D0F13',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
