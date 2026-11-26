import type { SessionPresence } from './session/types'

export default class ClientRoomManager {
  /** The server's start gate (RQ-S12): at least 2 members who are ready and connected. */
  /** At least two ready, connected members, one of them human (mirrors the server, RQ-S12). */
  static canStartGame(presence: readonly Pick<SessionPresence, 'status' | 'connected' | 'bot'>[]) {
    const ready = presence.filter((p) => p.status === 'ready' && p.connected)
    return ready.length >= 2 && ready.some((p) => p.bot === undefined)
  }
}
