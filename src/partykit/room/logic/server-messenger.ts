import assert from 'assert'
import type { ROOM_STATUS } from '@/constants/status'
import type { ConnectionState } from '@/interface/connection'
import type * as serverToClient from '@/interface/server-to-client'
import type * as Party from 'partykit/server'
import type { Ctx } from './game-rule'
import type { PrimeDaifugoGameState } from './game-rule/game-state'

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

  static async broadcastServerGameState(args: {
    room: Party.Room
    without?: string[]
    /** if only set, without only will be ignored */
    only?: string[]
  }) {
    const { room, without, only = [] } = args
    const gameState = await room.storage.get<PrimeDaifugoGameState>('gameState')
    const ctx = await room.storage.get<Ctx>('ctx')
    assert(gameState)
    assert(ctx)
    const content: serverToClient.SystemEvent = {
      action: 'sync',
      event: 'system',
      ctx,
      gameState,
    }
    room.broadcast(
      JSON.stringify(content),
      without ??
        Array.from(room.getConnections())
          .map((c) => c.id)
          .filter((id) => !only.includes(id)),
    )
  }

  static broadcastLeftTime(args: {
    room: Party.Room
    leftTime: number
  }) {
    const { room, leftTime } = args
    const payload: serverToClient.LeftTimeEvent = {
      event: 'left-time',
      leftTime,
    }
    room.broadcast(JSON.stringify(payload))
  }
}
