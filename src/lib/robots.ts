import type { MetadataRoute } from 'next'
import { SITE_URL, absoluteUrl, isProductionHost } from './site'

/** Never crawled: live rooms, the name gate, the design gallery and API routes. */
export const DISALLOWED_PATHS = ['/room/', '/login', '/labo/gallery', '/api/']

/**
 * robots.txt. Crawling is allowed only on the production deployment served from the
 * canonical host; previews, `*.vercel.app` aliases and local servers disallow everything.
 */
export function buildRobots({
  production,
  host,
}: {
  production: boolean
  host: string | null
}): MetadataRoute.Robots {
  if (!(production && isProductionHost(host))) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
