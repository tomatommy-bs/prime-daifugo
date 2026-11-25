'use client'
/**
 * STUB (Foundation). Final props contract for T1 `cards`, which owns and replaces this file.
 */
import type { CardId } from '@/game-card/src'

export type HandProps = {
  cardIds: CardId[]
  isMyTurn: boolean
  mode: 'basic' | 'factor'
  /** drawn or penalty cards, underlined for 2584 ms */
  freshIds?: CardId[]
  /** value chips under each card (A=1 … K=13) */
  showValues?: boolean
  onSelect: (card: CardId) => void
  layout?: 'auto' | 'fan' | 'scroll' | 'wrap'
}

export function Hand({ cardIds, isMyTurn, mode, onSelect }: HandProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: custom card listbox (stub)
    // biome-ignore lint/a11y/useFocusableInteractive: options carry the focus (stub)
    <div
      role="listbox"
      aria-label="手札"
      aria-orientation="horizontal"
      data-stub="Hand"
      data-my-turn={isMyTurn}
      data-mode={mode}
    >
      {cardIds.map((card) => (
        <button
          key={card}
          type="button"
          // biome-ignore lint/a11y/useSemanticElements: card options are buttons (stub)
          role="option"
          aria-selected={false}
          data-card={card}
          onClick={() => onSelect(card)}
        >
          {card}
        </button>
      ))}
    </div>
  )
}
