'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */
import type { CardId } from '@/game-card/src'
import type { ReactNode } from 'react'

export type FieldStackProps = {
  field: CardId[][]
  leadName?: string | null
  /** older values kept in the sequence readout, default 3 */
  compactHistory?: number
  /** reserved for future variants (no joker / 1729 visuals) */
  variant?: 'default'
  /** ResultOverlay / GrothendieckCut layered over the field */
  resultOverlay?: ReactNode
}

export function FieldStack({ field, resultOverlay }: FieldStackProps) {
  const top = field.at(-1) ?? null
  return (
    <section aria-label="場" data-stub="FieldStack">
      {top ? top.join(' ') : 'k = 自由'}
      {resultOverlay}
    </section>
  )
}
