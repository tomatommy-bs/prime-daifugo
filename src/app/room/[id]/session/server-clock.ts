/**
 * Client clock (spec §5 "Client clock", RQ-T5).
 *
 * - `offset ≈ serverNow − now()`, an exponential moving average over received frames.
 * - While a deadline is set, a 1 Hz interval writes the whole seconds left,
 *   `max(0, ceil((deadline − (now() + offset)) / 1000))`, into the `TurnClock` store that
 *   `TurnTimer`/`SeatClock` read. With no deadline the interval stops and the clock shows null.
 */
import type { TurnClock } from '../_ui/board/TurnTimer'

export const CLOCK_TICK_MS = 1000
/** Weight of a new sample in the offset average. */
export const OFFSET_ALPHA = 0.2

type IntervalId = ReturnType<typeof setInterval>

export type ServerClockOptions = {
  now?: () => number
  setInterval?: (fn: () => void, ms: number) => IntervalId
  clearInterval?: (id: IntervalId) => void
  alpha?: number
}

export type ServerClock = {
  /** Feed a frame's `serverNow`. */
  sample(serverNow: number): void
  /** The current estimate of `serverTime − localTime` in ms (0 before any sample). */
  offset(): number
  /** Server-clock "now" in ms. */
  serverNow(): number
  /** Start, retarget or (with null) stop the countdown. */
  setDeadline(deadline: number | null): void
  /** Whole seconds left for `deadline` right now. */
  secondsLeft(deadline: number): number
  dispose(): void
}

export function createServerClock(clock: TurnClock, options: ServerClockOptions = {}): ServerClock {
  const now = options.now ?? (() => Date.now())
  const startInterval = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms))
  const stopInterval = options.clearInterval ?? ((id) => globalThis.clearInterval(id))
  const alpha = options.alpha ?? OFFSET_ALPHA

  let offset: number | null = null
  let deadline: number | null = null
  let timer: IntervalId | null = null

  const secondsLeft = (d: number) =>
    Math.max(0, Math.ceil((d - (now() + (offset ?? 0))) / CLOCK_TICK_MS))

  const render = () => {
    clock.set(deadline === null ? null : secondsLeft(deadline))
  }

  const stop = () => {
    if (timer !== null) {
      stopInterval(timer)
      timer = null
    }
  }

  return {
    sample(serverNow) {
      const sample = serverNow - now()
      offset = offset === null ? sample : offset + alpha * (sample - offset)
      if (deadline !== null) {
        render()
      }
    },
    offset: () => offset ?? 0,
    serverNow: () => now() + (offset ?? 0),
    setDeadline(next) {
      deadline = next
      if (next === null) {
        stop()
      } else if (timer === null) {
        timer = startInterval(render, CLOCK_TICK_MS)
      }
      render()
    },
    secondsLeft,
    dispose() {
      stop()
      deadline = null
    },
  }
}
