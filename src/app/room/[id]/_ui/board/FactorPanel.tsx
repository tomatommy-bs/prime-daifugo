'use client'
/**
 * STUB (Foundation). Final props contract for T1 `cards`, which owns and replaces this file.
 */
import type { FactCardId } from '@/interface/common'

export type FactorPanelProps = {
  open: boolean
  /** value of the tray the expression must equal */
  target: number
  factCards: FactCardId[]
  onAddOperator: (op: '*' | '^') => void
  onRemove: (index: number) => void
  onClose: () => void
}

export function FactorPanel({ open, target, factCards, onAddOperator, onClose }: FactorPanelProps) {
  if (!open) {
    return null
  }
  return (
    <section aria-label="素因数分解" data-stub="FactorPanel" data-target={target}>
      <span>{factCards.join(' ')}</span>
      <button type="button" onClick={() => onAddOperator('*')}>
        ·
      </button>
      <button type="button" onClick={() => onAddOperator('^')}>
        xʸ
      </button>
      <button type="button" onClick={onClose}>
        戻る
      </button>
    </section>
  )
}
