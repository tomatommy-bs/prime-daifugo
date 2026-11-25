/**
 * Per-route metadata: every route has its own title, public pages are canonical and indexable,
 * private pages are noindex.
 */
import type { Metadata } from 'next'
import { describe, expect, it, vi } from 'vitest'
import { metadata as laboCalc } from './labo/calc/layout'
import { metadata as gallery } from './labo/gallery/layout'
import { metadata as login } from './login/layout'
import { metadata as home } from './page'
import { generateMetadata as room } from './room/[id]/layout'
import { metadata as newRoom } from './room/new/page'
import { metadata as rules } from './rules/page'

vi.mock('@/design/fonts', () => ({
  geistSans: { variable: 'font-sans' },
  geistMono: { variable: 'font-mono' },
}))

const titleOf = (meta: Metadata): string => {
  const t = meta.title
  if (typeof t === 'string') {
    return t
  }
  if (t && 'absolute' in t) {
    return t.absolute
  }
  throw new Error('no title')
}

const PRIVATE = { index: false, follow: false }

describe('route metadata', () => {
  it('sets site-wide defaults in the root layout', async () => {
    const { metadata: root } = await import('./layout')
    expect(root.metadataBase?.toString()).toBe('https://www.prime-daifugo.jp/')
    expect(root.title).toEqual({
      default: '素数大富豪 - 素数で遊ぶオンライン対戦カードゲーム',
      template: '%s | 素数大富豪',
    })
    expect(root.description).toContain('素数大富豪')
    expect(root.description).toContain('オンライン')
    expect(root.applicationName).toBe('素数大富豪')
    expect(root.formatDetection).toMatchObject({ telephone: false })
    expect(root.appleWebApp).toMatchObject({ capable: true, title: '素数大富豪' })
    expect(root.twitter).toMatchObject({ card: 'summary_large_image' })
    expect(root.openGraph).toMatchObject({
      type: 'website',
      locale: 'ja_JP',
      siteName: '素数大富豪',
    })
    // tests do not run as the Vercel production deployment
    expect(root.robots).toMatchObject(PRIVATE)
  })

  it('makes the home page canonical with the full site title', () => {
    expect(titleOf(home)).toBe('素数大富豪 - 素数で遊ぶオンライン対戦カードゲーム')
    expect(home.alternates?.canonical).toBe('/')
    expect(home.robots).toBeUndefined()
  })

  it.each([
    ['/rules', rules, '素数大富豪のルールと遊び方'],
    ['/labo/calc', laboCalc, '素数判定ラボ'],
  ] as const)('%s is canonical and indexable', (path, meta, title) => {
    expect(titleOf(meta)).toBe(title)
    expect(meta.alternates?.canonical).toBe(path)
    expect(meta.description?.length ?? 0).toBeGreaterThan(50)
    expect(meta.robots).toBeUndefined()
    expect(meta.openGraph).toMatchObject({ url: path })
  })

  it.each([
    ['/login', login, 'プレイヤー名の入力'],
    ['/labo/gallery', gallery, 'デザインギャラリー'],
    ['/room/new', newRoom, 'ルームを作成中'],
    ['/room/[id]', room({ params: { id: '1013' } }), 'ルーム 1013'],
  ] as const)('%s is titled and noindex', (_path, meta, title) => {
    expect(titleOf(meta)).toBe(title)
    expect(meta.robots).toMatchObject(PRIVATE)
    expect(meta.alternates?.canonical).toBeUndefined()
    expect(meta.openGraph).not.toHaveProperty('url')
  })

  it('previews a room link as an invite', () => {
    expect(room({ params: { id: '1013' } }).openGraph?.title).toBe(
      '素数大富豪 ルーム 1013 への招待',
    )
  })
})
