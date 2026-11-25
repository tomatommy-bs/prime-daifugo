import { buildRobots } from '@/lib/robots'
import { isProductionDeployment } from '@/lib/site'
import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

/** robots.txt, decided per request host (see `buildRobots`). */
export default function robots(): MetadataRoute.Robots {
  return buildRobots({ production: isProductionDeployment(), host: headers().get('host') })
}
