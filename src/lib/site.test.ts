import { describe, expect, it } from 'vitest'
import {
  NOINDEX,
  PUBLIC_PATHS,
  SITE_URL,
  absoluteUrl,
  isProductionDeployment,
  isProductionHost,
  isVercelProduction,
  pageMetadata,
  privatePageMetadata,
} from './site'

describe('site', () => {
  it('uses the www host as the canonical origin', () => {
    expect(SITE_URL).toBe('https://www.prime-daifugo.jp')
    expect(absoluteUrl('/rules')).toBe('https://www.prime-daifugo.jp/rules')
    expect(absoluteUrl('/')).toBe('https://www.prime-daifugo.jp/')
  })

  it.each([
    ['www.prime-daifugo.jp', true],
    ['WWW.Prime-Daifugo.jp', true],
    ['prime-daifugo.jp', true],
    ['www.prime-daifugo.jp:443', true],
    ['prime-daifugo.vercel.app', false],
    ['prime-daifugo-git-feature-seo.vercel.app', false],
    ['localhost:3000', false],
    ['', false],
    [null, false],
  ] as const)('isProductionHost(%s) is %s', (host, expected) => {
    expect(isProductionHost(host)).toBe(expected)
  })

  it('treats only VERCEL_ENV=production as an indexable deployment', () => {
    expect(isProductionDeployment({ VERCEL_ENV: 'production' })).toBe(true)
    expect(isProductionDeployment({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(isProductionDeployment({})).toBe(false)
  })

  it('redirects aliases only on the production deployment running on Vercel', () => {
    expect(isVercelProduction({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true)
    expect(isVercelProduction({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
    // a local `next start` of a production build keeps serving localhost
    expect(isVercelProduction({ VERCEL_ENV: 'production' })).toBe(false)
  })

  it('lists the public content pages', () => {
    expect(PUBLIC_PATHS).toEqual(['/', '/rules', '/labo/calc'])
  })

  it('builds indexable page metadata with a canonical link and the share card', () => {
    const meta = pageMetadata({ title: 'T', description: 'D', path: '/rules' })
    expect(meta.title).toBe('T')
    expect(meta.alternates?.canonical).toBe('/rules')
    expect(meta.robots).toBeUndefined()
    expect(meta.openGraph).toMatchObject({
      url: '/rules',
      title: 'T | 素数大富豪',
      locale: 'ja_JP',
    })
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: '/opengraph-image', width: 1200, height: 630 }),
    ])
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(meta.twitter?.images).toEqual([expect.objectContaining({ url: '/twitter-image' })])
  })

  it('builds noindex metadata whose preview has no og:url', () => {
    const meta = privatePageMetadata({ title: 'ルーム 7', share: { title: 'S', description: 'D' } })
    expect(meta.robots).toEqual(NOINDEX)
    expect(meta.alternates).toBeUndefined()
    expect(meta.openGraph).toMatchObject({ title: 'S', description: 'D' })
    expect(meta.openGraph).not.toHaveProperty('url')
    expect(meta.openGraph?.images).toBeDefined()
  })
})
