'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */
import { Seat } from './Seat'
import type { SeatModel } from './types'

export type SeatLineProps = {
  seats: SeatModel[]
  /** players in the residue ring ℤ/nℤ */
  n: number
}

export function SeatLine({ seats, n }: SeatLineProps) {
  return (
    <ol data-stub="SeatLine" aria-label={`ℤ/${n}ℤ`}>
      {seats.map((s) => (
        <li key={s.id}>
          <Seat {...s} layout="chip" />
        </li>
      ))}
    </ol>
  )
}
