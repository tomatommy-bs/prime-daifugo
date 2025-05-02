import { CONFIG } from '@/constants/config'
import { ROOM_STATUS } from '@/constants/status'
import type { ConnectionState } from '@/interface/connection'
import type * as Party from 'partykit/server'
import { ServerMessenger } from './logic'
import { messageHandler } from './logic/message-handler'

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    switch (req.method) {
      case 'GET': {
        const roomStatus = await this.room.storage.get('roomStatus')
        const body = { roomStatus }
        const payload = JSON.stringify(body)
        return new Response(payload, { status: 200 })
      }
      default:
        return new Response('method not allowed', { status: 405 })
    }
  }

  async onConnect(conn: Party.Connection<ConnectionState>, ctx: Party.ConnectionContext) {
    conn.setState({ status: 'not-ready', name: conn.id })
    const roomStatus =
      await this.room.storage.get<(typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]>('roomStatus')

    ServerMessenger.broadcastMessage({
      room: this.room,
      message: 'New Member joined the room',
      from: '__system__',
    })
    ServerMessenger.broadcastPresence({
      room: this.room,
    })
    ServerMessenger.broadcastRoomStatus({
      room: this.room,
      status: roomStatus,
    })

    this.room.context.parties.lobby.get(CONFIG.SINGLETON_LOBBY_ROOM_ID).fetch('/', {
      method: 'PUT',
      body: JSON.stringify({
        roomId: this.room.id,
        number: Array.from(this.room.getConnections()).length,
      }),
    })
  }

  onMessage(payload: string, sender: Party.Connection<ConnectionState>) {
    messageHandler.onMessage(this.room, payload, sender)
  }

  onClose(connection: Party.Connection<ConnectionState>): void | Promise<void> {
    ServerMessenger.broadcastMessage({
      room: this.room,
      message: `${connection.state?.name} left the room`,
      from: '__system__',
    })
    const connections = Array.from(this.room.getConnections<ConnectionState>())
    ServerMessenger.broadcastPresence({
      room: this.room,
    })

    this.room.context.parties.lobby.get(CONFIG.SINGLETON_LOBBY_ROOM_ID).fetch('/', {
      method: 'PUT',
      body: JSON.stringify({
        roomId: this.room.id,
        number: Array.from(this.room.getConnections()).length,
      }),
    })
    if (connections.length === 0) this.initialize()
  }

  onStart(): void | Promise<void> {
    console.log(`room ${this.room.id} started`)
  }

  async onAlarm(): Promise<void> {
    this.room.storage.setAlarm(new Date(Date.now() + 1 * 1000))
    const leftTime = await this.room.storage.get<number | null>('leftTime')
    this.room.storage.put('leftTime', (leftTime || 60) - 1)
    ServerMessenger.broadcastLeftTime({
      room: this.room,
      leftTime: (leftTime || 60) - 1,
    })
  }

  private initialize() {
    this.room.storage.deleteAlarm()
    this.room.storage.deleteAll()
    this.room.storage.put('roomStatus', ROOM_STATUS.waiting)
    console.log(`room ${this.room.id} initialized`)
  }

  onError(_connection: Party.Connection, error: Error): void | Promise<void> {
    console.error(error)
  }
}

Server satisfies Party.Worker
