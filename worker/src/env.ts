/** Worker bindings and vars (`worker/wrangler.jsonc`). */
import type { LobbyDO } from './lobby-do'
import type { RoomDO } from './room-do'

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

/** Durable Objects are created near the expected players (spec §8.1). */
export const LOCATION_HINT: DurableObjectLocationHint = 'apac'

/** The single lobby object. */
export const LOBBY_NAME = 'lobby'

export function lobbyStub(env: Env): DurableObjectStub<LobbyDO> {
  return env.LOBBY.get(env.LOBBY.idFromName(LOBBY_NAME), { locationHint: LOCATION_HINT })
}

export function roomStub(env: Env, roomId: string): DurableObjectStub<RoomDO> {
  return env.ROOM.get(env.ROOM.idFromName(roomId), { locationHint: LOCATION_HINT })
}
