'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 * A seat never renders opponent card faces, only a mini back and the count.
 */

export type SeatProps = {
  name: string
  handCount: number | null
  hueIndex: number
  isSelf?: boolean
  isActive?: boolean
  isLead?: boolean
  passed?: boolean
  observer?: boolean
  leftTime?: number
  timeLimit?: number
  /** `+n` penalty chip */
  penalty?: number
  /** reserved for future variants (no joker / 1729 visuals) */
  variant?: 'default'
  layout: 'chip' | 'node'
}

export function Seat({ name, handCount, isActive, observer, layout }: SeatProps) {
  return (
    <div data-stub="Seat" data-layout={layout} aria-current={isActive ? 'true' : undefined}>
      <span>{name}</span> {observer ? <span>観戦</span> : <span>{handCount ?? '—'}</span>}
    </div>
  )
}
