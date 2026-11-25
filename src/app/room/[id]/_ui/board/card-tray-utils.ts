/**
 * Pure helpers for the hand, the submit tray and the factor panel (spec §6.2).
 *
 * `trayChecks` is arithmetic help only (card count and `> 場`). It never judges primality:
 * the only special value it knows is the 57 Grothendieck cut, which the old board already
 * revealed before submission (spec §0.4).
 */
import { WORLD_CONFIG } from '@/constants/config'
import type { CardId } from '@/game-card/src'
import { concatCardNumbers } from '@/utils/play-card'

export type TrayChecks = {
  /** concatenated value of the tray, `null` when it is empty */
  value: number | null
  /** the card count matches the field (any count on a free field) */
  countOk: boolean
  /** the value beats the field top (always true on a free field) */
  greaterOk: boolean
  /** exactly 57 */
  isGrothendieck: boolean
}

/** Arithmetic checks for the submit tray against the current field top. */
export function trayChecks(cards: CardId[], fieldTop: CardId[] | null): TrayChecks {
  if (cards.length === 0) {
    return { value: null, countOk: false, greaterOk: false, isGrothendieck: false }
  }
  const value = concatCardNumbers(cards)
  const free = fieldTop === null || fieldTop.length === 0
  return {
    value,
    countOk: free || cards.length === fieldTop.length,
    greaterOk: free || value > concatCardNumbers(fieldTop),
    isGrothendieck: value === WORLD_CONFIG.GROTHENDIECK_PRIME,
  }
}

/**
 * Roving-tabindex navigation for horizontal card listboxes (WAI-ARIA listbox pattern):
 * ←/→ move by one (clamped), Home/End jump to the ends. Returns the next index, or `null`
 * when the key is not a navigation key or the list is empty.
 */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) {
    return null
  }
  const current = Math.min(Math.max(index, 0), count - 1)
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return Math.min(current + 1, count - 1)
    case 'ArrowLeft':
    case 'ArrowUp':
      return Math.max(current - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/** Exposed slice below which an overlapping hand switches to a scroll-snap row (§4, §7.5). */
export const minExposedSlice = (cardW: number): number => Math.max(32, 0.38 * cardW)

/** Card width from its height (`GameCard` is `0.69em × 1em`; spec uses 0.6886). */
export const cardWidthFromHeight = (h: number): number => 0.6886 * h

/** How long drawn / penalty cards stay `fresh` (Fibonacci ms, §8.1). */
export const FRESH_MS = 2584
