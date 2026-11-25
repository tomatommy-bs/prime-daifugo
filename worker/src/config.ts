/**
 * Worker `vars` → typed configuration (spec §3.5, §5, §8.1, §10). Pure: no Cloudflare imports.
 */
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../../src/session/types'

/** The string vars the Worker reads (all optional; missing or malformed values use defaults). */
export type ConfigVars = {
  GRACE_PLAYING_MS?: string
  GRACE_IDLE_MS?: string
  AWAY_TURN_CAP_MS?: string
  ROOM_TTL_IDLE_MS?: string
  ROOM_TTL_ACTIVE_MS?: string
}

/** Server sweep cadence while sockets are attached (spec §3.4). */
export const SWEEP_INTERVAL_MS = 60_000
/** Sockets with no frame or auto-response for longer than this are closed on sweep (spec §3.4). */
export const STALE_SOCKET_MS = 75_000
/** Re-report the connected count to the lobby this often while it is non-zero (spec §8.2). */
export const LOBBY_REPORT_INTERVAL_MS = 5 * 60_000
/** Close code used when the server drops a half-open socket on sweep (client reconnects). */
export const STALE_CLOSE_CODE = 1011

const DIGITS_RE = /^\d+$/
const TRAILING_SLASHES_RE = /\/+$/

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback
  }
  const trimmed = raw.trim()
  if (!DIGITS_RE.test(trimmed)) {
    return fallback
  }
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/** Build the `RoomConfig` from Worker vars, falling back to `DEFAULT_ROOM_CONFIG` per field. */
export function parseRoomConfig(vars: ConfigVars): RoomConfig {
  const d = DEFAULT_ROOM_CONFIG
  return {
    ...d,
    gracePlayingMs: positiveInt(vars.GRACE_PLAYING_MS, d.gracePlayingMs),
    graceIdleMs: positiveInt(vars.GRACE_IDLE_MS, d.graceIdleMs),
    awayTurnCapMs: positiveInt(vars.AWAY_TURN_CAP_MS, d.awayTurnCapMs),
    roomTtlIdleMs: positiveInt(vars.ROOM_TTL_IDLE_MS, d.roomTtlIdleMs),
    roomTtlActiveMs: positiveInt(vars.ROOM_TTL_ACTIVE_MS, d.roomTtlActiveMs),
  }
}

/** `ALLOWED_ORIGINS` is a comma-separated list; entries may use one `*` wildcard per host label. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((s) => s.trim().replace(TRAILING_SLASHES_RE, ''))
    .filter((s) => s.length > 0)
}
