import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('web app manifest', () => {
  it('declares the language, categories and theme colours', () => {
    const m = manifest()
    expect(m.lang).toBe('ja')
    expect(m.categories).toContain('games')
    expect(m.theme_color).toBe('#0D0F13')
    expect(m.background_color).toBe('#0D0F13')
    expect(m.start_url).toBe('/')
  })

  it('ships SVG, 192 and 512 PNG and a maskable icon', () => {
    const icons = manifest().icons ?? []
    expect(icons.map((i) => i.src)).toEqual([
      '/icon.svg',
      '/icons/192.png',
      '/icons/512.png',
      '/icons/maskable-512.png',
    ])
    expect(icons.find((i) => i.purpose === 'maskable')?.sizes).toBe('512x512')
  })
})
