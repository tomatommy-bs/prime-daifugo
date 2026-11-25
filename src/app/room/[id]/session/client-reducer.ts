/**
 * Pure client-side frame reducer (spec §6.4 "Client rule", §9.1, RQ-C3).
 *
 * `clientReduce(state, frame) → { state, transitions, acks }`:
 * - `welcome`: `snapshot` applies `snap` without animation; `replay` keeps the baseline so the
 *   following events animate; `current` changes nothing. A new `epoch` drops the old baseline.
 * - `evt`: with an unchanged epoch, `seq === lastSeq + 1` is applied and animated, `seq <= lastSeq`
 *   is a duplicate and ignored, and a gap applies the event's `snap` as a snapshot.
 * - `ack`: handed back in `acks` for the hook to resolve.
 * - `bye`: records the reason (`closeReason` for the terminal reasons the UI knows).
 */
import type { ClientGameStateBundle } from '@/shared/client-state'
import type { Ack, ByeReason, RoomEvent, RoomServerFrame, View } from '@/shared/protocol'
import { eventToTransitionMsg, viewToBundle } from './adapter'
import type { CloseReason, SessionTransition, TransitionMsg } from './types'

export type ClientState = {
  selfId: string | null
  /** room epoch of the baseline; null before the first welcome */
  epoch: string | null
  /** seq of the last applied frame; null when there is no usable baseline */
  lastSeq: number | null
  view: View | null
  game: ClientGameStateBundle | null
  /** a welcome arrived on the current connection */
  welcomed: boolean
  /** replayed events up to this seq arrived with no baseline: apply them without animation */
  catchUpTo: number | null
  /** last `bye` reason received, if any */
  bye: ByeReason | null
  closeReason: CloseReason
}

export type ClientReduceResult = {
  state: ClientState
  transitions: SessionTransition[]
  acks: Ack[]
}

/** Optional memory from an earlier page load (sessionStorage) used for the first `hello`. */
export function initialClientState(
  resume: { epoch: string; lastSeq: number } | null = null,
): ClientState {
  return {
    selfId: null,
    epoch: resume?.epoch ?? null,
    lastSeq: resume?.lastSeq ?? null,
    view: null,
    game: null,
    welcomed: false,
    catchUpTo: null,
    bye: null,
    closeReason: null,
  }
}

const CLOSE_REASONS: readonly ByeReason[] = [
  'superseded',
  'left',
  'room-full',
  'bad-name',
  'upgrade-required',
  'room-gone',
]

/** The UI close reason for a `bye` reason (`protocol` has none: it is shown as an error). */
export function closeReasonOf(reason: ByeReason): CloseReason {
  return CLOSE_REASONS.includes(reason) ? (reason as Exclude<CloseReason, null>) : null
}

/** The connection dropped: keep the baseline (board stays mounted) but await a new welcome. */
export function onDisconnected(state: ClientState): ClientState {
  return state.welcomed ? { ...state, welcomed: false } : state
}

const NONE = (state: ClientState): ClientReduceResult => ({ state, transitions: [], acks: [] })

function transition(
  prev: ClientGameStateBundle | null,
  next: ClientGameStateBundle | null,
  msg: TransitionMsg,
  event: RoomEvent | null,
): SessionTransition[] {
  return next === null ? [] : [{ prev, next, msg, event }]
}

function applySnapshot(
  state: ClientState,
  snap: View,
  seq: number,
  event: RoomEvent | null,
): ClientReduceResult {
  const game = viewToBundle(snap, state.selfId)
  return {
    state: { ...state, view: snap, game, lastSeq: seq },
    transitions: transition(state.game, game, { action: 'snapshot' }, event),
    acks: [],
  }
}

function reduceWelcome(
  state: ClientState,
  frame: Extract<RoomServerFrame, { t: 'welcome' }>,
): ClientReduceResult {
  const sameEpoch = state.epoch === frame.epoch
  const base: ClientState = {
    ...state,
    selfId: frame.selfId,
    epoch: frame.epoch,
    welcomed: true,
    catchUpTo: null,
    bye: null,
    closeReason: null,
  }
  if (frame.mode === 'snapshot' || frame.snap !== undefined) {
    if (frame.snap === undefined) {
      // malformed snapshot welcome: drop the baseline so the next event resyncs
      return NONE({ ...base, lastSeq: null })
    }
    return applySnapshot(base, frame.snap, frame.seq, null)
  }
  if (!sameEpoch) {
    // replay/current against another epoch cannot be trusted: resync on the next event
    return NONE({ ...base, lastSeq: null, view: null, game: null })
  }
  if (frame.mode === 'replay') {
    // replay with no baseline in memory (a reload): catch up without animation
    return NONE(base.view === null ? { ...base, catchUpTo: frame.seq } : base)
  }
  // current: nothing follows; the baseline is already at `seq`. With no baseline in memory there
  // is nothing to show: `lastSeq` is cleared so the hook's resync hello asks for a snapshot.
  return NONE({ ...base, lastSeq: base.view === null ? null : frame.seq })
}

function reduceEvt(
  state: ClientState,
  frame: Extract<RoomServerFrame, { t: 'evt' }>,
): ClientReduceResult {
  const { lastSeq } = state
  if (lastSeq !== null && frame.seq <= lastSeq) {
    return NONE(state)
  }
  const inOrder = lastSeq !== null && frame.seq === lastSeq + 1
  const catchingUp = state.catchUpTo !== null && frame.seq <= state.catchUpTo
  const nextState: ClientState =
    state.catchUpTo !== null && frame.seq >= state.catchUpTo ? { ...state, catchUpTo: null } : state
  if (!inOrder || state.view === null || catchingUp) {
    // gap (or no baseline): the event's own view is always a correct snapshot
    return applySnapshot(nextState, frame.snap, frame.seq, null)
  }
  const game = viewToBundle(frame.snap, state.selfId)
  const msg = eventToTransitionMsg(frame.e, frame.snap.members)
  return {
    state: { ...nextState, view: frame.snap, game, lastSeq: frame.seq },
    transitions: msg === null ? [] : transition(state.game, game, msg, frame.e),
    acks: [],
  }
}

export function clientReduce(state: ClientState, frame: RoomServerFrame): ClientReduceResult {
  switch (frame.t) {
    case 'welcome':
      return reduceWelcome(state, frame)
    case 'evt':
      return reduceEvt(state, frame)
    case 'ack':
      return { state, transitions: [], acks: [frame] }
    case 'bye':
      return NONE({ ...state, bye: frame.reason, closeReason: closeReasonOf(frame.reason) })
    default:
      return NONE(state)
  }
}
