/**
 * Starts the real Worker in local workerd for the L3 tests (spec §12 L3), with short grace
 * values so expiry can be observed with real waits. Opt-in: `INTEGRATION=1 npm run test:integration`.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unstable_startWorker } from 'wrangler'

export const TEST_ORIGIN = 'http://localhost:3124'

/** Vars for the test worker (spec §12 L3). */
export const TEST_VARS: Record<string, string> = {
  ALLOWED_ORIGINS: TEST_ORIGIN,
  GRACE_PLAYING_MS: '1500',
  GRACE_IDLE_MS: '1500',
  AWAY_TURN_CAP_MS: '1000',
  ROOM_TTL_IDLE_MS: '600000',
  ROOM_TTL_ACTIVE_MS: '1800000',
}

export type RunningWorker = {
  /** `http://127.0.0.1:<port>` */
  url: string
  /** `ws://127.0.0.1:<port>` */
  wsUrl: string
  persistDir: string
  dispose(): Promise<void>
}

const CONFIG = path.resolve(__dirname, '../../wrangler.jsonc')

export function makePersistDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pd-rt-'))
}

export function removePersistDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/** Start the Worker on a free port, persisting Durable Object state under `persistDir`. */
export async function startWorker(
  persistDir: string,
  vars: Record<string, string> = TEST_VARS,
): Promise<RunningWorker> {
  process.env.WRANGLER_SEND_METRICS = 'false'
  const worker = await unstable_startWorker({
    config: CONFIG,
    bindings: Object.fromEntries(
      Object.entries(vars).map(([k, value]) => [k, { type: 'plain_text' as const, value }]),
    ),
    dev: {
      persist: persistDir,
      server: { hostname: '127.0.0.1', port: 0 },
      inspector: false,
      watch: false,
      logLevel: 'error',
    },
  })
  await worker.ready
  const url = (await worker.url).toString().replace(/\/$/, '')
  return {
    url,
    wsUrl: url.replace(/^http/, 'ws'),
    persistDir,
    dispose: () => worker.dispose(),
  }
}
