/**
 * Virtual time for the session simulator (spec §12.1): a priority queue of callbacks ordered by
 * time, then by scheduling order. Nothing runs until `advance`/`advanceTo` is called.
 *
 * It also models the single Durable Object alarm: `setAlarm(at)` replaces the pending alarm, and
 * delivery is at-least-once — with a seeded probability the alarm fires a second time shortly
 * after, which the reducer must treat as a no-op (RQ-T6).
 */
import type { Rng } from '../../game/types'

type Entry = { at: number; seq: number; fn: () => void; cancelled: boolean }

export type TimerHandle = { cancel(): void }

export type SimClockOptions = {
  start?: number
  rng?: Rng
  /** probability that an alarm is delivered twice */
  duplicateAlarmProb?: number
}

export class SimClock {
  now: number
  private queue: Entry[] = []
  private seq = 0
  private alarm: { at: number; handle: TimerHandle } | null = null
  private alarmHandler: (() => void) | null = null
  private readonly rng: Rng | null
  private readonly dupProb: number
  /** called after every queued callback runs (the simulator checks invariants here) */
  afterEach: (() => void) | null = null
  /** number of callbacks run so far */
  steps = 0
  duplicateAlarms = 0

  constructor(opts: SimClockOptions = {}) {
    this.now = opts.start ?? 0
    this.rng = opts.rng ?? null
    this.dupProb = opts.duplicateAlarmProb ?? 0
  }

  schedule(at: number, fn: () => void): TimerHandle {
    const entry: Entry = { at: Math.max(at, this.now), seq: this.seq++, fn, cancelled: false }
    // keep the queue sorted by (at, seq); insertion from the back is cheap for near-future events
    let i = this.queue.length
    while (
      i > 0 &&
      (this.queue[i - 1].at > entry.at ||
        (this.queue[i - 1].at === entry.at && this.queue[i - 1].seq > entry.seq))
    ) {
      i -= 1
    }
    this.queue.splice(i, 0, entry)
    return {
      cancel: () => {
        entry.cancelled = true
      },
    }
  }

  after(ms: number, fn: () => void): TimerHandle {
    return this.schedule(this.now + ms, fn)
  }

  /** Run the earliest pending callback if it is due by `limit`. */
  private runNext(limit: number): boolean {
    while (this.queue.length > 0 && this.queue[0].cancelled) {
      this.queue.shift()
    }
    const head = this.queue[0]
    if (!head || head.at > limit) {
      return false
    }
    this.queue.shift()
    this.now = head.at
    this.steps += 1
    head.fn()
    this.afterEach?.()
    return true
  }

  advanceTo(target: number): void {
    while (this.runNext(target)) {
      // keep going
    }
    if (target > this.now) {
      this.now = target
    }
  }

  advance(ms: number): void {
    this.advanceTo(this.now + ms)
  }

  /** Time of the next pending callback, if any. */
  nextAt(): number | null {
    const head = this.queue.find((e) => !e.cancelled)
    return head ? head.at : null
  }

  /* ---------------- alarm (one per Durable Object) ---------------- */

  onAlarm(handler: () => void): void {
    this.alarmHandler = handler
  }

  get alarmAt(): number | null {
    return this.alarm?.at ?? null
  }

  setAlarm(at: number | null): void {
    if (this.alarm !== null && this.alarm.at === at) {
      return
    }
    this.alarm?.handle.cancel()
    this.alarm = null
    if (at === null) {
      return
    }
    const fireAt = Math.max(at, this.now)
    const handle = this.schedule(fireAt, () => {
      if (this.alarm?.handle !== handle) {
        return
      }
      this.alarm = null
      if (this.rng !== null && this.rng.next() < this.dupProb) {
        // at-least-once: deliver the same alarm again a little later
        this.duplicateAlarms += 1
        this.schedule(this.now + Math.floor(this.rng.next() * 2000), () => this.alarmHandler?.())
      }
      this.alarmHandler?.()
    })
    this.alarm = { at: fireAt, handle }
  }
}
