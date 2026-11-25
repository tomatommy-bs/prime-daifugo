'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */

export type FieldSequenceProps = {
  /** strictly increasing field values, oldest first */
  values: number[]
  /** struck out like a sieve (flow) */
  struck?: boolean
  layout: 'line' | 'phyllotaxis'
}

export function FieldSequence({ values, layout }: FieldSequenceProps) {
  return (
    <p data-stub="FieldSequence" data-layout={layout}>
      {values.join(' < ')}
    </p>
  )
}
