/**
 * Playwright E2E (spec §12 L4, scenarios §12.2): two browser contexts (`alice`, `bob`) play
 * against a local `wrangler dev` Worker and `next dev -p 3124`, with short grace values.
 *
 *   E2E=1 npm run test:e2e
 *   E2E=1 PW_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run test:e2e
 *   E2E=1 E2E_RT_PORT=8799 npm run test:e2e     # when :8787 is taken by something else
 *
 * Without `E2E=1` no server is started and every test is skipped, so a plain
 * `npm run test:e2e` is a no-op that exits 0.
 *
 * Servers (never reused: a long-grace dev Worker would break the timing scenarios):
 * - Worker: `npm run dev:server -- --var GRACE_PLAYING_MS:5000 …` (`--var KEY:VALUE`, wrangler
 *   splits on the first colon, so URL values are fine). With `E2E_RT_PORT` set, the same
 *   `wrangler dev` command runs on that port with its own `.wrangler/e2e-state` directory
 *   (wrangler rejects a repeated `--port`, so the npm script cannot be reused there).
 * - Web: `next dev -p 3124` (`E2E_WEB_PORT`) with `NEXT_PUBLIC_REALTIME_URL` pointing at the
 *   Worker. The Worker's `ALLOWED_ORIGINS` is set to exactly that origin.
 */
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const env = process.env
const ENABLED = env.E2E === '1'
const IS_CI = Boolean(env.CI)
const ROOT = path.resolve(__dirname, '..')

const DEFAULT_RT_PORT = 8787
const WEB_PORT = Number(env.E2E_WEB_PORT ?? 3124)
const RT_PORT = Number(env.E2E_RT_PORT ?? DEFAULT_RT_PORT)
const WEB_URL = `http://localhost:${WEB_PORT}`
const RT_URL = `http://127.0.0.1:${RT_PORT}`

/** Short session timings (spec §12.2): 5 s grace, 3 s turn cap while away. */
const WORKER_VARS = [
  'GRACE_PLAYING_MS:5000',
  'GRACE_IDLE_MS:5000',
  'AWAY_TURN_CAP_MS:3000',
  `ALLOWED_ORIGINS:${WEB_URL}`,
]
  .map((v) => `--var ${v}`)
  .join(' ')

const workerCommand =
  RT_PORT === DEFAULT_RT_PORT
    ? `npm run dev:server -- ${WORKER_VARS}`
    : `WRANGLER_SEND_METRICS=false npx wrangler dev -c worker/wrangler.jsonc --port ${RT_PORT} --local --persist-to .wrangler/e2e-state ${WORKER_VARS}`

const SERVER_START_TIMEOUT_MS = 180_000

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: path.join(ROOT, 'test-results'),
  // one room at a time: the lobby counters are global and the timing scenarios are real time
  fullyParallel: false,
  workers: 1,
  retries: IS_CI ? 1 : 0,
  forbidOnly: IS_CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: IS_CI
    ? [['github'], ['html', { outputFolder: path.join(ROOT, 'playwright-report'), open: 'never' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_URL,
    // the player contexts are created in fixtures.ts with the same viewport and locale plus
    // reduced motion (flights and dialogs settle at once; the session is what is under test)
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: env.PW_CHROMIUM_PATH ? { executablePath: env.PW_CHROMIUM_PATH } : {},
  },
  webServer: ENABLED
    ? [
        {
          command: workerCommand,
          url: `${RT_URL}/healthz`,
          cwd: ROOT,
          reuseExistingServer: false,
          timeout: SERVER_START_TIMEOUT_MS,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: `npx next dev -p ${WEB_PORT}`,
          url: `${WEB_URL}/login`,
          cwd: ROOT,
          reuseExistingServer: false,
          timeout: SERVER_START_TIMEOUT_MS,
          env: { NEXT_PUBLIC_REALTIME_URL: RT_URL, NEXT_TELEMETRY_DISABLED: '1' },
          stdout: 'ignore',
          stderr: 'pipe',
        },
      ]
    : undefined,
})
