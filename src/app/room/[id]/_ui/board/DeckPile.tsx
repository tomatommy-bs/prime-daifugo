'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */
import type { DrawDisabledReason } from './types'

export type DeckPileProps = {
  count: number
  canDraw: boolean
  disabledReason?: DrawDisabledReason | null
  onDraw?: () => void
  compact?: boolean
}

export function DeckPile({ count, canDraw, onDraw }: DeckPileProps) {
  return (
    <div data-stub="DeckPile" data-anchor="deck">
      <span>{count}</span>
      <button type="button" disabled={!canDraw} onClick={onDraw}>
        引く
      </button>
    </div>
  )
}
