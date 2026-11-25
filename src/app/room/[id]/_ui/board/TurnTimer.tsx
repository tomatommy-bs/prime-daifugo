'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */

export type TurnTimerProps = {
  /** seconds left; negative values display 0 */
  leftTime: number | null
  timeLimit: number
  /** diameter in px, default 28 */
  size?: number
}

export function TurnTimer({ leftTime, timeLimit }: TurnTimerProps) {
  const value = leftTime === null ? 0 : Math.max(0, leftTime)
  return (
    <div role="timer" aria-valuenow={value} aria-valuemax={timeLimit} data-stub="TurnTimer">
      {leftTime === null ? '—' : value}
    </div>
  )
}
