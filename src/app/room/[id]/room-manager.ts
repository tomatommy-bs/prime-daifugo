import { PresenceEvent } from '@/interface/server-to-client'

export default class ClientRoomManager {
  static canStartGame(presence: PresenceEvent['presence']) {
    return presence.filter((p) => p.status === 'ready').length >= 2
  }
}
