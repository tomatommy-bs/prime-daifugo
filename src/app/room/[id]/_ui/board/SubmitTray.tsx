'use client'
/**
 * STUB (Foundation). Final props contract for T1 `cards`, which owns and replaces this file.
 * Must never state primality before a server result (spec §0.4).
 */
import type { CardId } from '@/game-card/src'

export type SubmitTrayProps = {
  cardIds: CardId[]
  /** current field top, or null when the field is free */
  fieldTop: CardId[] | null
  onRemove: (card: CardId) => void
  onReset: () => void
  /** change to replay the blocked-submit shake */
  shakeKey?: number
  /** inline validation message (aria-live polite) */
  errorMessage?: string | null
}

export function SubmitTray({ cardIds, onRemove, onReset, errorMessage }: SubmitTrayProps) {
  return (
    <div data-stub="SubmitTray">
      {/* biome-ignore lint/a11y/useSemanticElements: custom card listbox (stub) */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: options carry the focus (stub) */}
      <div role="listbox" aria-label="提出" aria-orientation="horizontal">
        {cardIds.map((card) => (
          <button
            key={card}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: card options are buttons (stub)
            role="option"
            aria-selected={true}
            data-card={card}
            onClick={() => onRemove(card)}
          >
            {card}
          </button>
        ))}
      </div>
      <button type="button" onClick={onReset}>
        リセット
      </button>
      {errorMessage ? <p aria-live="polite">{errorMessage}</p> : null}
    </div>
  )
}
