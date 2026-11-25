import type { MetadataRoute } from 'next'
import { absoluteUrl, isProductionHost } from './site'

/**
 * Never crawled: API routes only. Rooms, the name gate and the design gallery stay crawlable
 * on purpose: they carry `noindex` (meta and `X-Robots-Tag`), which a crawler can only see if
 * robots.txt lets it fetch the page. Disallowing them would let a publicly shared room link
 * be indexed URL-only ("Indexed, though blocked by robots.txt").
 */
export const DISALLOWED_PATHS = ['/api/']

/**
 * robots.txt. Crawling is allowed only on the production deployment served from the
 * canonical host. Previews and local servers disallow everything; on the production
 * deployment, the `*.vercel.app` aliases never reach this route because the middleware
 * redirects them to the canonical origin first.
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
  }
}
