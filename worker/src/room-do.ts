/**
 * `RoomDO` (spec §2.1, §4.2): a thin Durable Object binding the pure `RoomHost` to SQLite
 * storage, the WebSocket Hibernation API and the alarm. No timers here (spec §2.4).
 */
import { DurableObject } from 'cloudflare:workers'
import { roomReduce } from '../../src/session/reducer'
import { ROOM_ID_RE } from '../../src/shared/ids'
import { PING, PONG } from '../../src/shared/protocol'
import { parseRoomConfig } from './config'
import { type Env, lobbyStub } from './env'
import type { RoomInfo } from './http'
import { type LobbyPort, RoomHost } from './room-host'
import { DurableObjectSockets } from './sockets'
import { SqlHostStorage } from './storage'

const clock = { now: () => Date.now() }
const ROOM_WS_PATH_RE = /^\/rooms\/([^/]+)\/ws$/

export class RoomDO extends DurableObject<Env> {
  private host: RoomHost | null = null
  private readonly sockets: DurableObjectSockets

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sockets = new DurableObjectSockets(ctx)
    // Answers the client's liveness ping without waking the object (spec §3.4).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    void ctx.blockConcurrencyWhile(async () => {
      const storage = await SqlHostStorage.open(ctx.storage)
      const lobby: LobbyPort = {
        report: (roomId, count, status) => {
          ctx.waitUntil(
            lobbyStub(env)
              .report(roomId, count, status)
              .catch(() => undefined),
          )
        },
        release: (roomId) => {
          ctx.waitUntil(
            lobbyStub(env)
              .release(roomId)
              .catch(() => undefined),
          )
        },
      }
      this.host = new RoomHost({
        storage,
        sockets: this.sockets,
        clock,
        reducer: roomReduce,
        config: parseRoomConfig(env),
        lobby,
      })
      this.host.onLoad(null)
    })
  }

  private get room(): RoomHost {
    if (!this.host) {
      throw new Error('RoomDO used before load')
    }
    return this.host
  }

  override fetch(request: Request): Response {
    const match = ROOM_WS_PATH_RE.exec(new URL(request.url).pathname)
    const roomId = match ? decodeURIComponent(match[1]) : ''
    if (!ROOM_ID_RE.test(roomId)) {
      return new Response('not found', { status: 404 })
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    this.room.ensureRoom(roomId)
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    this.room.onOpen(this.sockets.wrap(server))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.room.onMessage(this.sockets.wrap(ws), message)
  }

  override webSocketClose(ws: WebSocket): void {
    this.room.onClose(this.sockets.wrap(ws))
    try {
      ws.close(1000, 'closed')
    } catch {
      // already closed
    }
  }

  override webSocketError(ws: WebSocket): void {
    this.room.onClose(this.sockets.wrap(ws))
  }

  override alarm(): void {
    this.room.onAlarm()
  }

  /** RPC for `GET /rooms/:id` (spec §8.1). */
  info(): RoomInfo {
    return this.room.info()
  }
}
