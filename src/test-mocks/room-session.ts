/**
 * A controllable fake of `useRoomSession` (spec §9.1) for room-container tests.
 *
 * Usage in a test file:
 *   vi.mock('@/app/room/[id]/session/use-room-session', () => import('@/test-mocks/room-session'))
 *   import { roomSession } from '@/test-mocks/room-session'
 *   beforeEach(() => roomSession.reset({ selfId: 'p1' }))
 *   ...render
 *   act(() => roomSession.setSession({ roomStatus: 'waiting', presence: [...] }))
 *   act(() => roomSession.emitTransition({ prev, next, msg, event }))
 *   expect(roomSession.actions.pass).toHaveBeenCalled()
 *   roomSession.setAck('submit', { ok: false, reason: 'invalid-move' })
 *
 * The session object is replaced on every `setSession` (like a React state update);
 * `actions`, `subscribe` and `clock` keep their identity across updates.
 */
import type {
  AckResult,
  RoomSession,
  RoomSessionActions,
  SessionTransition,
} from '@/app/room/[id]/session/types'
import { DEFAULT_RULE } from '@/shared/rule-options'
import { useSyncExternalStore } from 'react'
import { type Mock, vi } from 'vitest'
import { createTurnClock } from '../app/room/[id]/_ui/board/TurnTimer'

type AckAction = Exclude<keyof RoomSessionActions, 'leave' | 'reconnect'>
type SessionData = Omit<RoomSession, 'subscribe' | 'actions' | 'clock'>

type FakeActions = {
  [K in AckAction]: Mock<RoomSessionActions[K]>
} & {
  leave: Mock<() => Promise<void>>
  reconnect: Mock<() => void>
}

const ACK_ACTIONS: AckAction[] = [
  'setReady',
  'unsetReady',
  'changeRule',
  'startGame',
  'draw',
  'pass',
  'submit',
]

const initialData = (): SessionData => ({
  selfId: 'p1',
  connection: 'open',
  closeReason: null,
  presence: [],
  roomStatus: null,
  rule: { ...DEFAULT_RULE },
  game: null,
  version: 0,
})

let data: SessionData = initialData()
const acks: Partial<Record<AckAction, AckResult>> = {}
const storeListeners = new Set<() => void>()
const transitionListeners = new Set<(t: SessionTransition) => void>()
const clock = createTurnClock(null)

const subscribe = (listener: (t: SessionTransition) => void) => {
  transitionListeners.add(listener)
  return () => {
    transitionListeners.delete(listener)
  }
}

const actions = {} as FakeActions
for (const name of ACK_ACTIONS) {
  ;(actions as Record<AckAction, unknown>)[name] = vi.fn(() =>
    Promise.resolve(acks[name] ?? { ok: true }),
  )
}
actions.leave = vi.fn(() => Promise.resolve())
actions.reconnect = vi.fn()

let session: RoomSession = { ...data, clock, subscribe, actions }

const publish = () => {
  session = { ...data, clock, subscribe, actions }
  for (const l of storeListeners) {
    l()
  }
}

const subscribeStore = (listener: () => void) => {
  storeListeners.add(listener)
  return () => {
    storeListeners.delete(listener)
  }
}

export const roomSession = {
  actions,
  clock,
  /** the room ids `useRoomSession` was called with, in order */
  roomIds: [] as string[],
  get current(): RoomSession {
    return session
  },
  /** listeners currently subscribed through `session.subscribe` */
  get listenerCount(): number {
    return transitionListeners.size
  },
  /** Merge fields into the session and re-render every consumer. */
  setSession(partial: Partial<SessionData>) {
    data = { ...data, ...partial }
    publish()
  },
  /**
   * Deliver one transition the way the real hook does: listeners first (so the director
   * measures the old DOM), then the session state (`game = t.next`, plus `patch`).
   */
  emitTransition(t: SessionTransition, patch: Partial<SessionData> = {}) {
    for (const l of [...transitionListeners]) {
      l(t)
    }
    data = { ...data, game: t.next, ...patch }
    publish()
  },
  /** The result the next calls of `action` resolve with (default `{ ok: true }`). */
  setAck(action: AckAction, result: AckResult) {
    acks[action] = result
  },
  /** Back to an open, empty session for `selfId: 'p1'`; clears mocks, acks and listeners. */
  reset(partial: Partial<SessionData> = {}) {
    data = { ...initialData(), ...partial }
    for (const name of ACK_ACTIONS) {
      delete acks[name]
    }
    for (const fn of Object.values(actions)) {
      ;(fn as Mock).mockClear()
    }
    transitionListeners.clear()
    clock.set(null)
    roomSession.roomIds = []
    publish()
  },
}

/** Drop-in replacement for the real hook (same signature). */
export function useRoomSession(roomId: string): RoomSession {
  const current = useSyncExternalStore(
    subscribeStore,
    () => session,
    () => session,
  )
  if (roomSession.roomIds.at(-1) !== roomId) {
    roomSession.roomIds.push(roomId)
  }
  return current
}

export function createDisconnectedSession(): RoomSession {
  return { ...initialData(), connection: 'connecting', selfId: null, clock, subscribe, actions }
}
