'use client'
/**
 * Compact seat bar (spec §6.3, §7.5; catalogue §9.2 #8): the residue line
 * `ℤ/nℤ ① → ② → ③ ↺`, rotated so self is first. The turn pointer is a `--mod` bar shared
 * through `layoutId="turn-pointer"`, so it slides from seat to seat. Observers sit in a
 * trailing `観戦` group, and when the turn lands on an observer (server quirk) no seat is lit.
 */
import { DUR, EASE, useMotionMode } from '@/design/motion'
import { m } from 'framer-motion'
import { Seat } from './Seat'
import { TurnTimer } from './TurnTimer'
import { observerSeats, playerSeats, residueLabel } from './seat-model'
import type { SeatModel } from './types'

export type SeatLineProps = {
  seats: SeatModel[]
  /** players in the residue ring ℤ/nℤ */
  n: number
}

export const TURN_POINTER_ID = 'turn-pointer'

/** The `--mod` pointer under the active seat; slides between seats via a shared layoutId. */
export function TurnPointer({ reduced }: { reduced: boolean }) {
  const style = { background: 'var(--mod)', height: 2 }
  if (reduced) {
    return (
      <span
        aria-hidden="true"
        data-turn-pointer=""
        className="absolute right-fib-1 bottom-0 left-fib-1 rounded-full"
        style={style}
      />
    )
  }
  return (
    <m.span
      aria-hidden="true"
      data-turn-pointer=""
      layoutId={TURN_POINTER_ID}
      className="absolute right-fib-1 bottom-0 left-fib-1 rounded-full"
      style={style}
      transition={{ duration: DUR.lg, ease: EASE.inOut }}
    />
  )
}

export function SeatLine({ seats, n }: SeatLineProps) {
  const mode = useMotionMode()
  const players = playerSeats(seats)
  const observers = observerSeats(seats)
  const active = players.find((s) => s.isActive) ?? null
  const timeLimit = players.find((s) => s.timeLimit !== undefined)?.timeLimit
  const ring = `ℤ/${n}ℤ`

  return (
    <nav
      aria-label="席順"
      data-seat-line=""
      data-motion={mode}
      className="flex h-[36px] min-w-0 items-center gap-fib-2 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none]"
    >
      <span
        className="num shrink-0 font-bold"
        style={{ fontSize: 'var(--fs--1)', color: 'var(--mod)' }}
        title="剰余環: 手番は k mod n で巡る"
      >
        {ring}
      </span>
      <ol aria-label={`${ring} 手番順`} className="m-0 flex list-none items-center gap-fib-1 p-0">
        {players.map((s, i) => {
          const last = i === players.length - 1
          return (
            <li
              key={s.id}
              data-k={s.k}
              className="relative flex items-center gap-[3px] pb-[3px]"
              aria-current={s.isActive ? 'step' : undefined}
            >
              <span
                aria-hidden="true"
                data-residue={s.k}
                className="num leading-none"
                style={{
                  fontSize: 'var(--fs-0)',
                  color: s.isActive ? 'var(--mod)' : 'var(--ink-muted)',
                  fontWeight: s.isActive ? 700 : 400,
                  transition: 'color var(--t-md) var(--ease-out)',
                }}
              >
                {residueLabel(s.k)}
              </span>
              <Seat {...s} layout="chip" />
              {s.isActive ? <TurnPointer reduced={mode === 'reduced'} /> : null}
              <span
                aria-hidden="true"
                className="num px-[2px]"
                style={{ fontSize: 'var(--fs--1)', color: 'var(--ink-muted)' }}
                title={last ? '一巡して ① に戻る' : undefined}
              >
                {last ? '↺' : '→'}
              </span>
            </li>
          )
        })}
      </ol>
      {observers.length > 0 ? (
        <ul
          aria-label="観戦"
          data-observers=""
          className="m-0 ml-fib-1 flex list-none items-center gap-fib-1 border-l p-0 pl-fib-2"
          style={{ borderColor: 'var(--line)' }}
        >
          {observers.map((s) => (
            <li key={s.id}>
              <Seat {...s} layout="chip" />
            </li>
          ))}
        </ul>
      ) : null}
      {timeLimit !== undefined ? (
        <span
          className="ml-auto flex shrink-0 items-center border-l pl-fib-2"
          style={{ borderColor: 'var(--line)' }}
        >
          <TurnTimer leftTime={active?.leftTime ?? null} timeLimit={timeLimit} size={28} />
        </span>
      ) : null}
    </nav>
  )
}
