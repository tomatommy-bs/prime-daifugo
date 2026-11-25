/**
 * Worker entry (spec §8.1): the router plus the two Durable Object classes.
 * Routing, Origin and CORS logic lives in `http.ts` (unit-tested); this file only wires it to
 * the bindings.
 */
import { parseAllowedOrigins } from './config'
import { type Env, lobbyStub, roomStub } from './env'
import { handleRequest } from './http'

export { LobbyDO } from './lobby-do'
export { RoomDO } from './room-do'
export type { Env }

export default {
  fetch(request, env) {
    return handleRequest(request, {
      allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
      createRoom: () => lobbyStub(env).allocate(),
      roomInfo: (id) => roomStub(env, id).info(),
      roomSocket: (id, req) => roomStub(env, id).fetch(req),
      lobbySocket: (req) => lobbyStub(env).fetch(req),
    })
  },
} satisfies ExportedHandler<Env>
