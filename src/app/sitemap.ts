import { PAGE_UPDATED, PUBLIC_PATHS, type PublicPath, absoluteUrl } from '@/lib/site'
import type { MetadataRoute } from 'next'

const PRIORITY: Record<PublicPath, number> = {
  '/': 1,
  '/rules': 0.8,
  '/labo/calc': 0.5,
  '/training': 0.6,
  '/training/prime': 0.5,
  '/training/beat': 0.5,
  '/training/factor': 0.5,
}

/** sitemap.xml: every public content page on the canonical origin. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    lastModified: PAGE_UPDATED[path],
    changeFrequency: 'monthly',
    priority: PRIORITY[path],
  }))
}
