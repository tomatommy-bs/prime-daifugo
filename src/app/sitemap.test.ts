import { describe, expect, it } from 'vitest'
import sitemap from './sitemap'

describe('sitemap.xml', () => {
  it('lists every public page on the canonical origin', () => {
    const entries = sitemap()
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.prime-daifugo.jp/',
      'https://www.prime-daifugo.jp/rules',
      'https://www.prime-daifugo.jp/labo/calc',
    ])
    for (const entry of entries) {
      expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.priority).toBeGreaterThan(0)
    }
  })

  it('never lists private routes', () => {
    const urls = sitemap().map((e) => e.url)
    for (const path of ['/room', '/login', '/labo/gallery']) {
      expect(urls.some((url) => url.includes(path))).toBe(false)
    }
  })
})
