import { sieve } from './sieve'

export type Point = { x: number; y: number }

/**
 * Position of `k` (k >= 1) on the Ulam spiral: 1 at the origin, 2 to its right, then
 * counter-clockwise on screen (3 is above 2). Screen coordinates: y grows downward.
 */
export function ulamCoord(k: number): Point {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError(`ulamCoord expects a positive integer, got ${k}`)
  }
  if (k === 1) {
    return { x: 0, y: 0 }
  }
  // Ring r holds (2r-1)^2+1 .. (2r+1)^2.
  const r = Math.ceil((Math.sqrt(k) - 1) / 2)
  const side = 2 * r
  const max = (2 * r + 1) ** 2
  const offset = max - k // distance back from the ring's last cell (r, r)
  if (offset < side) {
    // bottom edge, walking left from (r, r)
    return { x: r - offset, y: r }
  }
  if (offset < 2 * side) {
    // left edge, walking up from (-r, r)
    return { x: -r, y: r - (offset - side) }
  }
  if (offset < 3 * side) {
    // top edge, walking right from (-r, -r)
    return { x: -r + (offset - 2 * side), y: -r }
  }
  // right edge, walking down from (r, -r)
  return { x: r, y: -r + (offset - 3 * side) }
}

export type UlamCell = {
  k: number
  /** spiral coordinate, origin at 1 */
  x: number
  y: number
  /** grid coordinate, 0 … side-1 */
  col: number
  row: number
  prime: boolean
}

const cache = new Map<number, UlamCell[]>()

/** Every cell of a `side × side` Ulam square (k = 1 … side²). Memoised per side. */
export function ulamCells(side: number): UlamCell[] {
  const s = Math.max(1, Math.floor(side))
  const hit = cache.get(s)
  if (hit) {
    return hit
  }
  const total = s * s
  const primes = sieve(total)
  const half = Math.floor((s - 1) / 2)
  const cells: UlamCell[] = []
  for (let k = 1; k <= total; k++) {
    const { x, y } = ulamCoord(k)
    cells.push({ k, x, y, col: x + half, row: y + half, prime: primes[k] })
  }
  cache.set(s, cells)
  return cells
}
