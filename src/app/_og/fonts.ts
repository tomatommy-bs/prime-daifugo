/**
 * Fonts for the generated images (Open Graph card, icons). Satori cannot read the variable
 * Geist WOFF the site uses, so `fonts/` holds static subsets fetched from Google Fonts:
 * Geist Mono (printable ASCII plus a few math signs) and Noto Sans JP (only the kana and kanji
 * the card draws). Both are SIL Open Font License 1.1 (see fonts/README.md). If the card's
 * Japanese copy changes, refetch the Noto subset with the new characters.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type OgFont = {
  name: string
  data: ArrayBuffer
  weight: 500 | 700
  style: 'normal'
}

const FONT_DIR = join(process.cwd(), 'src/app/_og/fonts')

const FILES = [
  { file: 'GeistMono-Medium.woff', name: 'Geist Mono', weight: 500 },
  { file: 'GeistMono-Bold.woff', name: 'Geist Mono', weight: 700 },
  { file: 'NotoSansJP-Medium.woff', name: 'Noto Sans JP', weight: 500 },
  { file: 'NotoSansJP-Bold.woff', name: 'Noto Sans JP', weight: 700 },
] as const

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer

export function loadOgFonts(): Promise<OgFont[]> {
  return Promise.all(
    FILES.map(async ({ file, name, weight }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: toArrayBuffer(await readFile(join(FONT_DIR, file))),
    })),
  )
}
