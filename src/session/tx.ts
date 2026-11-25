/**
 * One reducer transaction: a lazily cloned draft, the events it emits and its directives.
 * The input state is never mutated; when nothing changes, `finish()` returns it reference-equal.
 */
import type { RoomEvent } from '../shared/protocol'
import { cloneState, connectedCount } from './members'
import { computeWakeAt, gcTtlMs } from './timers'
import type { Directive, ReducerDeps, ReducerResult, RoomState } from './types'

export class Tx {
  private draft: RoomState | null = null
  private destroyed = false
  readonly events: { seq: number; e: RoomEvent }[] = []
  readonly directives: Directive[] = []

  readonly base: RoomState
  readonly deps: ReducerDeps

  constructor(base: RoomState, deps: ReducerDeps) {
    this.base = base
    this.deps = deps
  }

  /** Current state (the draft once anything changed). Read-only by convention. */
  get s(): RoomState {
    return this.draft ?? this.base
  }

  /** The mutable draft (cloned from the input on first use). */
  mut(): RoomState {
    if (this.draft === null) {
      this.draft = cloneState(this.base)
    }
    return this.draft
  }

  /** Emit an event: bumps `version` (= its seq) and the ring floor (RQ-S17). */
  emit(e: RoomEvent): void {
    const d = this.mut()
    d.version += 1
    d.ringFloor = Math.max(d.ringFloor, d.version - this.deps.config.ringSize + 1)
    this.events.push({ seq: d.version, e })
  }

  directive(d: Directive): void {
    this.directives.push(d)
  }

  /** The room is garbage-collected by this input. */
  destroy(): void {
    this.destroyed = true
  }

  finish(): ReducerResult {
    if (this.draft !== null && !this.destroyed) {
      const d = this.draft
      // RQ-S15: the GC clock runs only while nobody is connected; any connect cancels it.
      d.gcAt =
        connectedCount(d) === 0
          ? (d.gcAt ?? this.deps.now + gcTtlMs(d.status, this.deps.config))
          : null
    }
    const state = this.s
    return {
      state,
      events: this.events,
      directives: this.directives,
      wakeAt: this.destroyed ? null : computeWakeAt(state),
      lobbyCount: this.destroyed ? 0 : connectedCount(state),
    }
  }
}
