import type { SessionPresence } from './session/types'

export default class ClientRoomManager {
  /** The server's start gate (RQ-S12): at least 2 members who are ready and connected. */
  static canStartGame(presence: readonly Pick<SessionPresence, 'status' | 'connected'>[]) {
    return presence.filter((p) => p.status === 'ready' && p.connected).length >= 2
  }
}
