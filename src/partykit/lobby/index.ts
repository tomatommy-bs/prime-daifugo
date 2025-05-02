import type { ConnectionState } from '@/interface/connection'
import type * as Party from 'partykit/server'
import { z } from 'zod'

type Storage = {
  lobby: number
  room: Record<string, number>
}

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    switch (req.method) {
      case 'GET': {
        const lobby = Array.from(this.room.getConnections()).length
        const room = (await this.room.storage.get<Record<string, number>>('room')) ?? {}
        const body: Storage = { lobby, room }
        const payload = JSON.stringify(body)
        return new Response(payload, { status: 200 })
      }
      case 'PUT': {
        const bodySchema = z.object({
          roomId: z.string(),
          number: z.number(),
        })
        const body = await req.json<z.infer<typeof bodySchema>>()
        bodySchema.parse(body)
        let room = (await this.room.storage.get<Record<string, number>>('room')) ?? {}

        if (body.number === 0) {
          delete room[body.roomId]
          await this.room.storage.put('room', room)
        } else {
          room = {
            ...room,
            [body.roomId]: body.number,
          }
          await this.room.storage.put('room', room)
        }
        const msg: Storage = {
          lobby: Array.from(this.room.getConnections()).length,
          room: room,
        }
        this.room.broadcast(JSON.stringify(msg))
        return new Response(null, { status: 200 })
      }
      default:
        return new Response('method not allowed', { status: 405 })
    }
  }

  async onConnect(conn: Party.Connection<ConnectionState>, ctx: Party.ConnectionContext) {
    const room = (await this.room.storage.get<Record<string, number>>('room')) ?? {}
    const msg: Storage = {
      lobby: Array.from(this.room.getConnections()).length,
      room: room,
    }
    await this.room.storage.put<Storage>('online', msg)
    this.room.broadcast(JSON.stringify(msg))
  }

  async onClose(connection: Party.Connection): Promise<void> {
    const room = (await this.room.storage.get<Record<string, number>>('room')) ?? {}
    const msg: Storage = {
      lobby: Array.from(this.room.getConnections()).length,
      room: room,
    }
    await this.room.storage.put<Storage>('online', msg)
    this.room.broadcast(JSON.stringify(msg))
  }

  onStart(): void | Promise<void> {
    this.room.storage.deleteAll()
    console.log('lobby started')
  }

  onError(_connection: Party.Connection, error: Error): void | Promise<void> {
    console.error(error)
  }
}

Server satisfies Party.Worker
