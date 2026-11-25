/**
 * The share-card fonts are subsets that hold only the characters the card draws (see
 * fonts/README.md). Satori silently draws nothing for a missing glyph, so every character the
 * card renders must be in one of the bundled fonts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OgCard } from './og-card'

const FONT_DIR = join(__dirname, 'fonts')

/** The decompressed `cmap` table of a WOFF 1.0 file. */
function woffCmap(file: string): Buffer {
  const woff = readFileSync(join(FONT_DIR, file))
  expect(woff.toString('latin1', 0, 4)).toBe('wOFF')
  const numTables = woff.readUInt16BE(12)
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20
    if (woff.toString('latin1', entry, entry + 4) !== 'cmap') {
      continue
    }
    const offset = woff.readUInt32BE(entry + 4)
    const compLength = woff.readUInt32BE(entry + 8)
    const origLength = woff.readUInt32BE(entry + 12)
    const data = woff.subarray(offset, offset + compLength)
    return compLength < origLength ? inflateSync(data) : data
  }
  throw new Error(`${file} has no cmap`)
}

/** Glyph id for a code point from a format 4 or 12 subtable, 0 when missing. */
function glyphOf(cmap: Buffer, codePoint: number): number {
  const count = cmap.readUInt16BE(2)
  let best = 0
  for (let i = 0; i < count; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4)
    const format = cmap.readUInt16BE(sub)
    if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12
        const start = cmap.readUInt32BE(at)
        const end = cmap.readUInt32BE(at + 4)
        if (codePoint >= start && codePoint <= end) {
          return cmap.readUInt32BE(at + 8) + codePoint - start
        }
      }
    } else if (format === 4 && codePoint <= 0xffff) {
      const segX2 = cmap.readUInt16BE(sub + 6)
      const ends = sub + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const ranges = deltas + segX2
      for (let s = 0; s < segX2; s += 2) {
        if (codePoint > cmap.readUInt16BE(ends + s)) {
          continue
        }
        const start = cmap.readUInt16BE(starts + s)
        if (codePoint < start) {
          break
        }
        const delta = cmap.readInt16BE(deltas + s)
        const rangeOffset = cmap.readUInt16BE(ranges + s)
        if (rangeOffset === 0) {
          best = (codePoint + delta) & 0xffff
        } else {
          const glyph = cmap.readUInt16BE(ranges + s + rangeOffset + (codePoint - start) * 2)
          best = glyph === 0 ? 0 : (glyph + delta) & 0xffff
        }
        break
      }
    }
  }
  return best
}

const FONTS = [
  'GeistMono-Medium.woff',
  'GeistMono-Bold.woff',
  'NotoSansJP-Medium.woff',
  'NotoSansJP-Bold.woff',
].map((file) => ({ file, cmap: woffCmap(file) }))

/** Every distinct visible non-space character the card renders. */
function cardCharacters(): string[] {
  const text = renderToStaticMarkup(<OgCard />)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
  return [...new Set(text.replace(/\s/g, ''))]
}

describe('share card fonts', () => {
  it('reads glyphs from the bundled subsets', () => {
    expect(glyphOf(FONTS[0].cmap, 'A'.codePointAt(0) as number)).toBeGreaterThan(0)
    expect(glyphOf(FONTS[2].cmap, '素'.codePointAt(0) as number)).toBeGreaterThan(0)
    // a kanji the card never draws is not in the subset
    expect(glyphOf(FONTS[2].cmap, '鬱'.codePointAt(0) as number)).toBe(0)
  })

  it('has a glyph for every character the card draws', () => {
    const chars = cardCharacters()
    expect(chars).toEqual(expect.arrayContaining(['素', '数', 'Ō']))
    const missing = chars.filter(
      (ch) => !FONTS.some(({ cmap }) => glyphOf(cmap, ch.codePointAt(0) as number) > 0),
    )
    // if this fails, refetch the subsets with the new characters (fonts/README.md)
    expect(missing).toEqual([])
  })
})
