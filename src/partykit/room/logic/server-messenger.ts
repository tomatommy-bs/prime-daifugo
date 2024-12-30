import type { ROOM_STATUS } from '@/constants/status'
import type { ConnectionState } from '@/interface/connection'
import type * as serverToClient from '@/interface/server-to-client'
import type * as Party from 'partykit/server'

export class ServerMessenger {
  /**
   * 主に chat イベントを送信する
   */
  static broadcastMessage(args: {
    room: Party.Room
    message: string
    from: string
  }) {
    const { room, message, from } = args
    const payload: serverToClient.ChatEvent = {
      event: 'chat',
      message: message,
      from,
    }
    room.broadcast(JSON.stringify(payload))
  }

  /**
   * 主に presence イベントを送信する
   * ルーム内の全員のプレゼンス情報を送信する
   */
  static broadcastPresence(args: { room: Party.Room }) {
    const { room } = args
    const connections = Array.from(room.getConnections<ConnectionState>()).map((conn) => ({
      id: conn.id,
      name: conn.state?.name || conn.id.substring(0, 8),
      status: conn.state?.status || 'not-ready',
    }))
    const payload: serverToClient.PresenceEvent = {
      event: 'presence',
      presence: connections,
    }
    room.broadcast(JSON.stringify(payload))
  }

  static broadcastRoomStatus(args: {
    room: Party.Room
    status?: (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]
  }) {
    const { room, status } = args
    if (status === undefined) {
      return
    }
    const payload: serverToClient.RoomStatusEvent = {
      event: 'room-status',
      status,
    }
    room.broadcast(JSON.stringify(payload))
  }

  /**
   * 主に system イベントを送信する
   * - action: "game-start" でゲーム開始を通知する
   */
  static broadcastSystemEvent(args: {
    room: Party.Room
    content: serverToClient.SystemEvent
  }) {
    const { room, content } = args
    const payload: serverToClient.SystemEvent = content
    room.broadcast(JSON.stringify(payload))
  }
}
