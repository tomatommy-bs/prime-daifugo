/**
 * Worker entry (spec §8.1). STUB created by the foundation so `wrangler dev` boots; T3 owns it
 * and replaces it with the router, `RoomDO` and `LobbyDO`.
 */
import { DurableObject } from 'cloudflare:workers'

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>
  LOBBY: DurableObjectNamespace<LobbyDO>
  ALLOWED_ORIGINS: string
  GRACE_PLAYING_MS: string
  GRACE_IDLE_MS: string
  AWAY_TURN_CAP_MS: string
  ROOM_TTL_IDLE_MS: string
  ROOM_TTL_ACTIVE_MS: string
}

export class RoomDO extends DurableObject<Env> {}

export class LobbyDO extends DurableObject<Env> {}

export default {
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && pathname === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not implemented', { status: 501 })
  },
} satisfies ExportedHandler<Env>
