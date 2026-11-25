/**
 * Ports, URLs and Worker vars shared by playwright.config.ts and the fixtures.
 *
 * - `E2E_RT_PORT` (default 8787): the local `wrangler dev` Worker.
 * - `E2E_WEB_PORT` (default 3124): `next dev`.
 */
import path from 'node:path'

const env = process.env

export const ROOT = path.resolve(__dirname, '..')
export const E2E_ENABLED = env.E2E === '1'

export const WEB_PORT = Number(env.E2E_WEB_PORT ?? 3124)
export const RT_PORT = Number(env.E2E_RT_PORT ?? 8787)
export const WEB_URL = `http://localhost:${WEB_PORT}`
export const RT_URL = `http://127.0.0.1:${RT_PORT}`

/** Short session timings (spec §12.2): 5 s grace, 3 s turn cap while away. */
export const GRACE_MS = 5000
export const AWAY_TURN_CAP_MS = 3000

/** `wrangler dev --var KEY:VALUE` pairs (wrangler splits on the first colon, so URLs are fine). */
export const WORKER_VARS: Record<string, string> = {
  GRACE_PLAYING_MS: String(GRACE_MS),
  GRACE_IDLE_MS: String(GRACE_MS),
  AWAY_TURN_CAP_MS: String(AWAY_TURN_CAP_MS),
  ALLOWED_ORIGINS: WEB_URL,
}

/** The Worker's local Durable Object store for E2E (wiped when the suite's Worker first starts). */
export const RT_PERSIST_DIR = path.join(ROOT, '.wrangler', 'e2e-state')
