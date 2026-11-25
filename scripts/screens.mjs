#!/usr/bin/env node
/**
 * Visual smoke test: screenshots of the design gallery and the static pages (spec §10.5).
 *
 *   npm run screens
 *   PW_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run screens
 *   BASE_URL=http://localhost:3000 npm run screens
 *   SCENES=my-turn,factor npm run screens       # subset of scenes
 *
 * - Targets BASE_URL (default http://localhost:3123). When nothing answers there, the
 *   script starts `next dev -p 3123` itself and stops it afterwards.
 * - Uses the installed `playwright`; `PW_CHROMIUM_PATH` overrides the browser binary
 *   (e.g. an existing `chrome-headless-shell` when the bundled revision is not installed).
 * - Every gallery scene × {844x390, 390x844, 1440x900} × {light, dark} is captured with
 *   `reducedMotion: 'reduce'` for deterministic frames, into
 *   `docs/design/screens/<scene>-<w>x<h>-<scheme>.png` (gitignored). `/`, `/login` and
 *   `/labo/calc` are captured too, as `home-…`, `login-…` and `calc-…`.
 * - Exits non-zero on page errors or console errors. Connection errors towards the local
 *   realtime Worker (:8787, e.g. the home page lobby socket) are expected when only
 *   `next dev` runs and are ignored; any other console error still fails the run.
 *
 * The full two-player flow against the real backend is the Playwright E2E suite
 * (`E2E=1 npm run test:e2e`, see e2e/), not this script.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/design/screens')
const PORT = 3123
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')

const ALL_SCENES = [
  'home-parts',
  'waiting',
  'my-turn',
  'opp-turn',
  'factor',
  'not-prime',
  'cut57',
  'flow',
  'game-set',
  'observer',
  'connecting',
]
const SCENES = process.env.SCENES
  ? process.env.SCENES.split(',').filter((s) => ALL_SCENES.includes(s))
  : ALL_SCENES
const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]
const SCHEMES = ['light', 'dark']
const STATIC_PAGES = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'calc', path: '/labo/calc' },
]

/**
 * Connection noise towards the realtime Worker (:8787) is expected without
 * `npm run dev:server` (the home page lobby socket fails and its counters stay at "—"), and
 * the Vercel Analytics script only exists on Vercel (404 under `next start`).
 */
const IGNORED = [
  /:8787\b/,
  /\bwss?:\/\/[^\s'"]*\/lobby\b/,
  /WebSocket connection to .* failed/i,
  /\/_vercel\/insights\//,
]
const ignored = (text) => IGNORED.some((re) => re.test(text))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status > 0
  } catch {
    return false
  }
}

/** Start `next dev -p 3123` when nothing is listening on BASE_URL. */
async function ensureServer() {
  if (await isUp(`${BASE_URL}/labo/gallery`)) {
    return null
  }
  if (process.env.BASE_URL) {
    throw new Error(`BASE_URL ${BASE_URL} is not reachable`)
  }
  console.log(`starting next dev on :${PORT} …`)
  const child = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: process.platform !== 'win32',
  })
  let log = ''
  child.stdout.on('data', (d) => {
    log += d
  })
  child.stderr.on('data', (d) => {
    log += d
  })
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early:\n${log}`)
    }
    if (await isUp(`${BASE_URL}/labo/gallery`)) {
      return child
    }
    await sleep(500)
  }
  child.kill('SIGTERM')
  throw new Error(`next dev did not start within 120 s:\n${log}`)
}

function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return
  }
  try {
    // kill the whole process group (npx → next → workers)
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function capture(browser, { url, file, viewport, scheme, problems }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: 'reduce',
    locale: 'ja-JP',
    hasTouch: viewport.width < 900,
  })
  // A screenshot of the board, not of the portrait rotate banner.
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('shouldShowRotateRecommender', 'false')
    } catch {
      // storage may be unavailable
    }
  })
  const page = await context.newPage()
  const label = path.basename(file)
  page.on('console', (msg) => {
    if (msg.type() !== 'error') {
      return
    }
    const text = msg.text()
    const where = msg.location()?.url ?? ''
    if (!(ignored(text) || ignored(where))) {
      // first line only: React warnings carry long component stacks
      problems.push(`${label}: console.error ${text.split('\n')[0]}${where ? ` (${where})` : ''}`)
    }
  })
  page.on('pageerror', (err) => {
    if (!ignored(String(err))) {
      problems.push(`${label}: pageerror ${err.message}`)
    }
  })
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  } catch {
    // dev HMR / sockets can keep the network busy; fall back to the load event
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
  }
  if (url.includes('/labo/gallery?scene=')) {
    // the gallery renders client-only; wait for the scene root instead of a blank frame
    try {
      await page.waitForSelector('[data-gallery-scene]', { timeout: 30_000 })
    } catch {
      problems.push(`${label}: scene root [data-gallery-scene] never rendered`)
    }
  }
  await page.evaluate(() => document.fonts?.ready)
  await sleep(300)
  await page.screenshot({ path: file, fullPage: false })
  await context.close()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const server = await ensureServer()
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  })
  const problems = []
  let count = 0
  try {
    const jobs = []
    for (const scene of SCENES) {
      for (const viewport of VIEWPORTS) {
        for (const scheme of SCHEMES) {
          jobs.push({
            url: `${BASE_URL}/labo/gallery?scene=${scene}&scheme=${scheme}`,
            file: path.join(OUT_DIR, `${scene}-${viewport.width}x${viewport.height}-${scheme}.png`),
            viewport,
            scheme,
          })
        }
      }
    }
    for (const { name, path: p } of STATIC_PAGES) {
      for (const viewport of VIEWPORTS) {
        for (const scheme of SCHEMES) {
          jobs.push({
            url: `${BASE_URL}${p}`,
            file: path.join(OUT_DIR, `${name}-${viewport.width}x${viewport.height}-${scheme}.png`),
            viewport,
            scheme,
          })
        }
      }
    }
    // warm up the dev compiler once per route before timing-sensitive captures
    for (const p of ['/labo/gallery?scene=my-turn', '/', '/login', '/labo/calc']) {
      await fetch(`${BASE_URL}${p}`).catch(() => undefined)
    }
    for (const job of jobs) {
      await capture(browser, { ...job, problems })
      count += 1
      process.stdout.write(`\r${count}/${jobs.length} ${path.basename(job.file)}`.padEnd(80))
    }
    process.stdout.write('\n')
  } finally {
    await browser.close()
    stopServer(server)
  }

  console.log(`${count} screenshots → ${path.relative(ROOT, OUT_DIR)}/`)
  if (problems.length > 0) {
    console.error(`\n${problems.length} console problem(s):`)
    for (const p of problems) {
      console.error(`  - ${p}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
