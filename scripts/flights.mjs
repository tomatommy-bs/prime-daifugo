#!/usr/bin/env node
/**
 * Frame sequences of the card flights (spec §9.2 #7, #11, #19, #23–#25), for tuning motion.
 *
 *   npm run flights
 *   PW_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run flights
 *   STEPS=draw-me,cut57 VIEWPORTS=844x390 FRAME_MS=34 npm run flights
 *
 * - Opens `/labo/gallery?scene=flights&play=<step>` with full motion, waits for the
 *   transition (`data-flight-phase="after"`) and screenshots in real time, at most one frame
 *   per `FRAME_MS` (default 55) for `DURATION_MS` (default 1650). Each frame is labelled with
 *   the real time since the transition (`data-flight-at`), so labels stay honest even when a
 *   screenshot takes longer than a frame. (Playwright's fake clock is not used: it keeps
 *   the DOM on time but screenshots drift from it.)
 * - Writes `docs/design/screens/flights/<step>-<w>x<h>/<nnnn>ms.png` (gitignored) plus one
 *   `contact-<step>-<w>x<h>.png` contact sheet per sequence with the frames tiled.
 * - Starts `next dev -p 3123` when nothing answers on BASE_URL (like `npm run screens`).
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/design/screens/flights')
const PORT = 3123
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const ALL_STEPS = [
  'draw-me',
  'draw-opp',
  'play-me',
  'play-opp',
  'penalty-opp',
  'penalty-me',
  'flow',
  'cut57',
  'deal',
]
const STEPS = process.env.STEPS
  ? process.env.STEPS.split(',').filter((s) => ALL_STEPS.includes(s))
  : ALL_STEPS
const VIEWPORTS = (process.env.VIEWPORTS ?? '844x390,1440x900').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number)
  return { width, height }
})
const SCHEME = process.env.SCHEME === 'dark' ? 'dark' : 'light'
const FRAME_MS = Number(process.env.FRAME_MS ?? 55)
const DURATION_MS = Number(process.env.DURATION_MS ?? 1650)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status > 0
  } catch {
    return false
  }
}

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
    stdio: 'ignore',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: process.platform !== 'win32',
  })
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await isUp(`${BASE_URL}/labo/gallery`)) {
      return child
    }
    await sleep(500)
  }
  throw new Error('next dev did not start within 120 s')
}

function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** Tile the frames into one image, labelled with their time, using the browser itself. */
async function contactSheet(browser, frames, file, viewport) {
  const cols = 4
  const scale = viewport.width > 1000 ? 0.25 : 0.4
  const w = Math.round(viewport.width * scale)
  const h = Math.round(viewport.height * scale)
  const rows = Math.ceil(frames.length / cols)
  const page = await browser.newPage({ viewport: { width: cols * w, height: rows * (h + 18) } })
  const cells = frames
    .map(
      (f) =>
        `<figure style="margin:0;width:${w}px"><img src="data:image/png;base64,${f.png.toString('base64')}" style="width:${w}px;height:${h}px;display:block"/><figcaption style="font:12px monospace;height:18px">${f.t} ms</figcaption></figure>`,
    )
    .join('')
  await page.setContent(
    `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(${cols},${w}px)">${cells}</body>`,
  )
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

async function captureStep(browser, step, viewport, problems) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: SCHEME,
    reducedMotion: 'no-preference',
    locale: 'ja-JP',
    hasTouch: viewport.width < 900,
  })
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('shouldShowRotateRecommender', 'false')
    } catch {
      // storage may be unavailable
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => problems.push(`${step}: pageerror ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/1999|WebSocket|_vercel/.test(msg.text())) {
      problems.push(`${step}: console.error ${msg.text().split('\n')[0]}`)
    }
  })
  await page.goto(`${BASE_URL}/labo/gallery?scene=flights&play=${step}&scheme=${SCHEME}`, {
    waitUntil: 'load',
    timeout: 60_000,
  })
  await page.waitForSelector('[data-flight-step]', { timeout: 30_000 })
  await page.evaluate(() => document.fonts?.ready)
  // the first screenshot of a page is slow: take it now, then replay the step (its button
  // remounts the board and restarts the delay), so the capture never misses the start
  await page.screenshot()
  await page.click('[data-flight-controls] button[aria-pressed="true"]')
  await page.waitForSelector('[data-flight-phase="before"]', { timeout: 10_000 })
  try {
    await page.waitForSelector('[data-flight-phase="after"]', { timeout: 10_000, polling: 'raf' })
  } catch {
    problems.push(`${step}: transition did not fire`)
  }
  const dir = path.join(OUT_DIR, `${step}-${viewport.width}x${viewport.height}`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const frames = []
  const firedAt = Number(await page.getAttribute('[data-flight-step]', 'data-flight-at'))
  let next = 0
  for (;;) {
    // wait for the next frame slot, then label the shot with the real elapsed time
    let t = await page.evaluate((at) => performance.now() - at, firedAt)
    if (t < next) {
      await sleep(next - t)
      t = await page.evaluate((at) => performance.now() - at, firedAt)
    }
    if (t > DURATION_MS) {
      break
    }
    const ms = Math.round(t)
    const png = await page.screenshot({
      path: path.join(dir, `${String(ms).padStart(4, '0')}ms.png`),
    })
    frames.push({ t: ms, png })
    next = t + FRAME_MS
  }
  await context.close()
  await contactSheet(
    browser,
    frames,
    path.join(OUT_DIR, `contact-${step}-${viewport.width}x${viewport.height}.png`),
    viewport,
  )
  return frames.length
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const server = await ensureServer()
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  })
  const problems = []
  try {
    await fetch(`${BASE_URL}/labo/gallery?scene=flights`).catch(() => undefined)
    for (const step of STEPS) {
      for (const viewport of VIEWPORTS) {
        const n = await captureStep(browser, step, viewport, problems)
        console.log(`${step} ${viewport.width}x${viewport.height}: ${n} frames`)
      }
    }
  } finally {
    await browser.close()
    stopServer(server)
  }
  console.log(`→ ${path.relative(ROOT, OUT_DIR)}/`)
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const p of problems) {
      console.error(`  - ${p}`)
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
