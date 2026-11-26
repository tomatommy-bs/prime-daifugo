import { PAGE_UPDATED, PUBLIC_PATHS } from '@/lib/site'
import { describe, expect, it } from 'vitest'
import sitemap from './sitemap'

describe('sitemap.xml', () => {
  it('lists every public page on the canonical origin', () => {
    const entries = sitemap()
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.prime-daifugo.jp/',
      'https://www.prime-daifugo.jp/rules',
      'https://www.prime-daifugo.jp/labo/calc',
      'https://www.prime-daifugo.jp/training',
      'https://www.prime-daifugo.jp/training/prime',
      'https://www.prime-daifugo.jp/training/beat',
      'https://www.prime-daifugo.jp/training/factor',
    ])
    for (const entry of entries) {
      expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(entry.lastModified as string))).toBe(false)
      expect(entry.priority).toBeGreaterThan(0)
    }
  })

  it('never lists private routes', () => {
    const urls = sitemap().map((e) => e.url)
    for (const path of ['/room', '/login', '/labo/gallery']) {
      expect(urls.some((url) => url.includes(path))).toBe(false)
    }
  })

  it('takes lastmod from the date of each page', () => {
    expect(Object.keys(PAGE_UPDATED).sort()).toEqual([...PUBLIC_PATHS].sort())
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname as keyof typeof PAGE_UPDATED
      expect(entry.lastModified).toBe(PAGE_UPDATED[path])
    }
  })
})
