/**
 * `useRoomSession(roomId)` (spec §9.1). STUB created by the foundation; T4 owns and implements it.
 * Returns a static, disconnected session so the UI can compile and render against the contract.
 */
import { DEFAULT_RULE } from '@/shared/rule-options'
import { createTurnClock } from '../_ui/board/TurnTimer'
import type { AckResult, RoomSession } from './types'

const disconnected = (): Promise<AckResult> =>
  Promise.resolve({ ok: false, reason: 'disconnected' })

export function createDisconnectedSession(): RoomSession {
  return {
    selfId: null,
    connection: 'connecting',
    closeReason: null,
    presence: [],
    roomStatus: null,
    rule: { ...DEFAULT_RULE },
    game: null,
    version: 0,
    clock: createTurnClock(null),
    subscribe: () => () => undefined,
    actions: {
      setReady: disconnected,
      unsetReady: disconnected,
      changeRule: disconnected,
      startGame: disconnected,
      draw: disconnected,
      pass: disconnected,
      submit: disconnected,
      leave: () => Promise.resolve(),
      reconnect: () => undefined,
    },
  }
}

const STATIC_SESSION = createDisconnectedSession()

export function useRoomSession(_roomId: string): RoomSession {
  return STATIC_SESSION
}
