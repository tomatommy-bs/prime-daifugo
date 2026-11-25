/**
 * `LobbyDO` (spec §8.2): a thin Durable Object binding the pure `LobbyCore` to SQLite storage,
 * hibernatable home page sockets and the alarm. No timers here (spec §2.4).
 */
import { DurableObject } from 'cloudflare:workers'
import { PING, PONG } from '../../src/shared/protocol'
import type { Env } from './env'
import { LobbyCore } from './lobby-core'
import { SqlLobbyStorage } from './storage'

const WS_OPEN = 1
const clock = { now: () => Date.now() }

export class LobbyDO extends DurableObject<Env> {
  private core: LobbyCore | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    void ctx.blockConcurrencyWhile(async () => {
      const storage = await SqlLobbyStorage.open(ctx.storage)
      const sockets = () => ctx.getWebSockets().filter((ws) => ws.readyState === WS_OPEN)
      this.core = new LobbyCore(storage, sockets, clock)
    })
  }

  private get lobby(): LobbyCore {
    if (!this.core) {
      throw new Error('LobbyDO used before load')
    }
    return this.core
  }

  override fetch(request: Request): Response {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    this.lobby.onConnect(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === PING) {
      ws.send(PONG)
    }
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, 'closed')
    } catch {
      // already closed
    }
    this.lobby.onDisconnect()
  }

  override webSocketError(): void {
    this.lobby.onDisconnect()
  }

  override alarm(): void {
    this.lobby.onAlarm()
  }

  /** RPC: a fresh prime room id with a 10-minute reservation (RQ-L3). */
  allocate(): string {
    return this.lobby.allocate()
  }

  /** RPC from `RoomDO` whenever its connected count changes, and every 5 min while > 0. */
  report(roomId: string, count: number, status: string | null): void {
    this.lobby.report(roomId, count, status)
  }

  /** RPC from `RoomDO` on GC. */
  release(roomId: string): void {
    this.lobby.release(roomId)
  }
}
