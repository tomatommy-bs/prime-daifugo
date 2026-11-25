import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Entries of an ICO file: [width, height] (0 means 256). */
function icoSizes(buf: Buffer): [number, number][] {
  expect(buf.readUInt16LE(0)).toBe(0) // reserved
  expect(buf.readUInt16LE(2)).toBe(1) // type: icon
  const count = buf.readUInt16LE(4)
  return Array.from({ length: count }, (_, i) => [buf[6 + i * 16] || 256, buf[7 + i * 16] || 256])
}

describe('favicon.ico', () => {
  it('is a real icon with a 48 px entry for search-result favicons', () => {
    const sizes = icoSizes(readFileSync(join(__dirname, 'favicon.ico')))
    expect(sizes).toContainEqual([48, 48])
    expect(sizes).toContainEqual([32, 32])
    expect(sizes).toContainEqual([16, 16])
  })
})
