import { describe, expect, it } from 'vitest'
import { DISALLOWED_PATHS, buildRobots } from './robots'

describe('buildRobots', () => {
  it('allows crawling on the production host and links the sitemap', () => {
    const robots = buildRobots({ production: true, host: 'www.prime-daifugo.jp' })
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS })
    expect(robots.sitemap).toBe('https://www.prime-daifugo.jp/sitemap.xml')
  })

  it('keeps rooms, the name gate, the gallery and API routes out', () => {
    expect(DISALLOWED_PATHS).toEqual(['/room/', '/login', '/labo/gallery', '/api/'])
  })

  it.each([
    { production: false, host: 'www.prime-daifugo.jp' },
    { production: true, host: 'prime-daifugo.vercel.app' },
    { production: true, host: null },
    { production: false, host: 'localhost:3000' },
  ])('disallows everything for %o', (input) => {
    const robots = buildRobots(input)
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' })
    expect(robots.sitemap).toBeUndefined()
  })
})
