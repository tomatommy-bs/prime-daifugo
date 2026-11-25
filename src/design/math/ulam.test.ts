import { describe, expect, it } from 'vitest'
import { ulamCells, ulamCoord } from './ulam'

describe('ulamCoord', () => {
  it('places 1..9 counter-clockwise from the origin', () => {
    const expected = [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]
    expected.forEach(([x, y], i) => {
      expect(ulamCoord(i + 1)).toEqual({ x, y })
    })
  })
  it('continues into the next ring', () => {
    expect(ulamCoord(10)).toEqual({ x: 2, y: 1 })
    expect(ulamCoord(11)).toEqual({ x: 2, y: 0 })
    expect(ulamCoord(13)).toEqual({ x: 2, y: -2 })
    expect(ulamCoord(17)).toEqual({ x: -2, y: -2 })
    expect(ulamCoord(21)).toEqual({ x: -2, y: 2 })
    expect(ulamCoord(25)).toEqual({ x: 2, y: 2 })
  })
  it('consecutive cells are neighbours', () => {
    for (let k = 1; k < 441; k++) {
      const a = ulamCoord(k)
      const b = ulamCoord(k + 1)
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
    }
  })
  it('rejects invalid input', () => {
    expect(() => ulamCoord(0)).toThrow()
    expect(() => ulamCoord(1.5)).toThrow()
  })
})

describe('ulamCells', () => {
  it('gives 441 unique cells for side 21, filling the grid', () => {
    const cells = ulamCells(21)
    expect(cells).toHaveLength(441)
    const keys = new Set(cells.map((c) => `${c.col},${c.row}`))
    expect(keys.size).toBe(441)
    for (const c of cells) {
      expect(c.col).toBeGreaterThanOrEqual(0)
      expect(c.col).toBeLessThan(21)
      expect(c.row).toBeGreaterThanOrEqual(0)
      expect(c.row).toBeLessThan(21)
    }
  })
  it('marks primes and centres 1', () => {
    const cells = ulamCells(7)
    expect(cells[0]).toMatchObject({ k: 1, col: 3, row: 3, prime: false })
    expect(cells.filter((c) => c.prime)).toHaveLength(15) // primes <= 49
  })
  it('is memoised', () => {
    expect(ulamCells(9)).toBe(ulamCells(9))
  })
})
