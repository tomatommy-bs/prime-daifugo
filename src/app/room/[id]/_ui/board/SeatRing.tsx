'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */
import type { ReactNode } from 'react'
import { Seat } from './Seat'
import type { SeatModel } from './types'

export type SeatRingProps = {
  seats: SeatModel[]
  width: number
  height: number
  /** table centre (field, sequence) */
  children?: ReactNode
}

export function SeatRing({ seats, width, height, children }: SeatRingProps) {
  return (
    <div data-stub="SeatRing" style={{ width, height }}>
      <ol>
        {seats.map((s) => (
          <li key={s.id}>
            <Seat {...s} layout="node" />
          </li>
        ))}
      </ol>
      {children}
    </div>
  )
}
