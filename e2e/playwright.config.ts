/**
 * Playwright E2E (spec §12 L4, scenarios §12.2): browser contexts (`alice`, `bob`, more through
 * `spawnPlayer`) play against a local `wrangler dev` Worker and `next dev -p 3124`, with short
 * grace values.
 *
 *   E2E=1 npm run test:e2e
 *   E2E=1 PW_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run test:e2e
 *   E2E=1 E2E_RT_PORT=8799 npm run test:e2e     # when :8787 is taken by something else
 *
 * Without `E2E=1` no server is started and every test is skipped, so a plain
 * `npm run test:e2e` is a no-op that exits 0.
 *
 * Servers (never reused: a long-grace dev Worker would break the timing scenarios):
 * - Worker: `wrangler dev --local` on `E2E_RT_PORT` (default 8787) with
 *   `--var GRACE_PLAYING_MS:5000 …` and its own, freshly wiped `.wrangler/e2e-state`. It is
 *   started by the worker-scoped `realtime` fixture (e2e/realtime-server.ts) rather than
 *   `webServer`, so the restart scenario can kill it and start it again on the same store.
 * - Web: `next dev -p 3124` (`E2E_WEB_PORT`) with `NEXT_PUBLIC_REALTIME_URL` pointing at the
 *   Worker and its own build dir (`.next-alt`, so a dev server already running in this checkout
 *   keeps `.next`). The Worker's `ALLOWED_ORIGINS` is set to exactly that origin.
 */
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { E2E_ENABLED, ROOT, RT_URL, WEB_PORT, WEB_URL } from './env'

const IS_CI = Boolean(process.env.CI)
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
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: E2E_ENABLED
    ? {
        command: `npx next dev -p ${WEB_PORT}`,
        url: `${WEB_URL}/login`,
        cwd: ROOT,
        reuseExistingServer: false,
        timeout: SERVER_START_TIMEOUT_MS,
        env: {
          NEXT_PUBLIC_REALTIME_URL: RT_URL,
          NEXT_TELEMETRY_DISABLED: '1',
          NEXT_DIST_DIR: '.next-alt',
        },
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
})
