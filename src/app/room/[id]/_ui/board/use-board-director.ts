'use client'
/**
 * The board director (§9.3). A FIFO queue of *visual* events only: game state is always
 * applied immediately by the container and is never delayed here.
 *
 * - Each event plays for its catalogue duration, or until `done()` is called by the
 *   animating component (ResultOverlay, GrothendieckCut, a skip via Esc / tap).
 * - Hold rule: `game-end` / `room-status: waitingNextRound` (`holdEnd`) are held until the
 *   next `submit-*` event has played, or `HOLD_MS` pass, whichever is first. Only then is
 *   `ended` set, which opens the GameSetDialog.
 * - Backlog: with more than 3 events waiting, the next steps play at 0.5×; with more than 6
 *   the intermediate events are dropped and the director jumps to the latest one.
 * - Reduced motion: every duration is at most `REDUCED_MAX_MS`.
 */
import { useEffect, useReducer, useRef } from 'react'
import type { BoardEvent, BoardEventType } from './types'

export type EndEvent = Extract<BoardEvent, { type: 'end' }>

/** Full-motion durations in ms (Fibonacci, from the §9.2 catalogue rows). */
export const EVENT_DURATION_MS: Record<BoardEventType, number> = {
  deal: 1200, // #7, total ≤ 1.2 s
  draw: 377, // #11
  'submit-ok': 987, // #19, flight + underline + shimmer
  'submit-fail': 2584, // #20–#23, tree + return + penalty (ResultOverlay usually calls done first)
  pass: 233, // #12
  flow: 610, // #24
  cut57: 1597, // #25
  turn: 377, // #8
  end: 0, // never queued: held, then exposed as `ended`
}

export const HOLD_MS = 800
export const REDUCED_MAX_MS = 144
/** queue length above which steps play at half duration */
export const BACKLOG_FAST = 3
/** queue length above which intermediate events are dropped */
export const BACKLOG_DROP = 6

const isSubmit = (e: BoardEvent | null) =>
  e?.type === 'submit-ok' || e?.type === 'submit-fail' || e?.type === 'cut57'

type Timer = ReturnType<typeof setTimeout>

/** Framework-free core so the queue rules can be reasoned about (and tested) directly. */
export class DirectorCore {
  reduced = false
  current: BoardEvent | null = null
  /** duration the current event was scheduled with, in ms */
  currentMs = 0
  /** playback rate chosen when the current event started (1 or 0.5) */
  rate = 1
  ended: EndEvent | null = null
  private queue: BoardEvent[] = []
  private held: EndEvent | null = null
  private timer: Timer | null = null
  private holdTimer: Timer | null = null
  private readonly onChange: () => void

  constructor(onChange: () => void = () => undefined) {
    this.onChange = onChange
  }

  get queueLength(): number {
    return this.queue.length
  }

  get isHolding(): boolean {
    return this.held !== null
  }

  durationOf(e: BoardEvent, rate = 1): number {
    const ms = EVENT_DURATION_MS[e.type] * rate
    return this.reduced ? Math.min(ms, REDUCED_MAX_MS) : ms
  }

  push = (e: BoardEvent): void => {
    if (e.type === 'end') {
      this.holdEnd(e)
      return
    }
    if (e.type === 'deal') {
      // a new round closes the previous game end
      this.clearEnd()
    }
    this.queue.push(e)
    if (this.queue.length > BACKLOG_DROP) {
      const dropped = this.queue.slice(0, -1)
      this.queue = this.queue.slice(-1)
      if (this.held && dropped.some(isSubmit)) {
        this.release()
      }
    }
    if (this.current === null) {
      this.advance()
    }
    this.onChange()
  }

  holdEnd = (e: EndEvent): void => {
    if (this.ended) {
      if (this.ended.winner === null && e.winner !== null) {
        this.ended = e
        this.onChange()
      }
      return
    }
    if (this.held) {
      // `game-end` and `room-status` both ask; keep the one that knows the winner
      if (this.held.winner === null) {
        this.held = e
      }
      return
    }
    this.held = e
    this.holdTimer = setTimeout(() => this.release(), HOLD_MS)
    this.onChange()
  }

  /** The animating component finished (or the viewer skipped). */
  done = (): void => {
    if (this.current !== null) {
      this.finish()
    }
  }

  clearEnd = (): void => {
    this.clearHoldTimer()
    this.held = null
    if (this.ended) {
      this.ended = null
      this.onChange()
    }
  }

  /** Re-arm the timer after an unmount / remount (React strict mode). */
  resume(): void {
    if (this.current !== null && this.timer === null) {
      this.timer = setTimeout(() => this.finish(), this.currentMs)
    }
    if (this.held !== null && this.holdTimer === null) {
      this.holdTimer = setTimeout(() => this.release(), HOLD_MS)
    }
  }

  dispose(): void {
    this.clearTimer()
    this.clearHoldTimer()
  }

  private advance(): void {
    this.clearTimer()
    const next = this.queue.shift() ?? null
    this.current = next
    if (next === null) {
      this.currentMs = 0
      this.rate = 1
      return
    }
    this.rate = this.queue.length > BACKLOG_FAST ? 0.5 : 1
    this.currentMs = this.durationOf(next, this.rate)
    this.timer = setTimeout(() => this.finish(), this.currentMs)
  }

  private finish(): void {
    const finished = this.current
    this.current = null
    if (isSubmit(finished) && this.held) {
      this.release()
    }
    this.advance()
    this.onChange()
  }

  private release(): void {
    this.clearHoldTimer()
    if (this.held) {
      this.ended = this.held
      this.held = null
      this.onChange()
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer)
      this.holdTimer = null
    }
  }
}

export type BoardDirector = {
  /** the visual event playing now */
  current: BoardEvent | null
  /** its scheduled duration in ms (already scaled for backlog and reduced motion) */
  currentMs: number
  push: (e: BoardEvent) => void
  holdEnd: (e: EndEvent) => void
  done: () => void
  /** events waiting behind `current` */
  queueLength: number
  /** the released game end: open the GameSetDialog while set */
  ended: EndEvent | null
  clearEnd: () => void
}

export function useBoardDirector({ reduced }: { reduced: boolean }): BoardDirector {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const ref = useRef<DirectorCore | null>(null)
  if (ref.current === null) {
    ref.current = new DirectorCore(rerender)
  }
  const core = ref.current
  core.reduced = reduced

  useEffect(() => {
    core.resume()
    return () => core.dispose()
  }, [core])

  return {
    current: core.current,
    currentMs: core.currentMs,
    push: core.push,
    holdEnd: core.holdEnd,
    done: core.done,
    queueLength: core.queueLength,
    ended: core.ended,
    clearEnd: core.clearEnd,
  }
}
