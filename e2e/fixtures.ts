/**
 * Shared E2E fixtures (spec §12.2): `alice` and `bob` are separate browser contexts, each with
 * its own `name` cookie and therefore its own `pd_sid` (issued by the middleware), plus helpers
 * built on role/text selectors and the data attributes the UI already renders.
 *
 * Network faults go through `player.net`. Room sockets are routed through Playwright
 * (`routeWebSocket` + `connectToServer`, which opens a real socket from the page, so `Origin`
 * is unchanged). `goOffline()` sets the context offline *and* closes the routed sockets, and
 * new room sockets are refused until `goOnline()`. Chromium's offline emulation alone does not
 * reliably drop an already open WebSocket, and the server would then only notice through its
 * 75 s sweep, far beyond the shortened grace.
 */
import {
  type BrowserContext,
  type Locator,
  type Page,
  type WebSocketRoute,
  test as base,
  expect,
} from '@playwright/test'

export { expect }

/** Spec §12.2 runs only with `E2E=1`; see playwright.config.ts. */
export const E2E_ENABLED = process.env.E2E === '1'

/** Mirrors the Worker vars set in playwright.config.ts. */
export const GRACE_MS = 5000
export const AWAY_TURN_CAP_MS = 3000

const ROOM_WS_PATH = /^\/rooms\/[A-Za-z0-9_-]{1,32}\/ws$/
const PASS_BUTTON = /パス/
const ROOM_PATH = /\/room\/(?!new$)[A-Za-z0-9_-]{1,32}$/

export type NetControl = {
  /** Offline, with every routed room socket closed; new room sockets are refused. */
  goOffline(): Promise<void>
  goOnline(): Promise<void>
}

export type Player = {
  name: string
  context: BrowserContext
  page: Page
  net: NetControl
}

async function installNetControl(context: BrowserContext): Promise<NetControl> {
  let offline = false
  let live: WebSocketRoute[] = []
  await context.routeWebSocket(
    (url) => ROOM_WS_PATH.test(url.pathname),
    (ws) => {
      if (offline) {
        // like a connection that cannot be established; not a terminal 40xx close
        ws.close()
        return
      }
      ws.connectToServer()
      live.push(ws)
    },
  )
  return {
    async goOffline() {
      offline = true
      const sockets = live
      live = []
      // closing the page side forwards the close to the server (default route behaviour)
      await Promise.all(sockets.map((ws) => ws.close().catch(() => undefined)))
      await context.setOffline(true)
    },
    async goOnline() {
      offline = false
      await context.setOffline(false)
    },
  }
}

async function makePlayer(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  name: string,
): Promise<Player> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
    reducedMotion: 'reduce',
  })
  await context.addCookies([{ name: 'name', value: name, url: baseURL }])
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('shouldShowRotateRecommender', 'false')
    } catch {
      // storage may be unavailable
    }
  })
  const net = await installNetControl(context)
  const page = await context.newPage()
  return { name, context, page, net }
}

type Fixtures = {
  /** auto: skips every test unless E2E=1 */
  e2eGate: undefined
  alice: Player
  bob: Player
  /** a further player (e.g. a lobby watcher) with its own context */
  spawnPlayer: (name: string) => Promise<Player>
}

export const test = base.extend<Fixtures>({
  e2eGate: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must destructure their first argument
    async ({}, use, testInfo) => {
      testInfo.skip(!E2E_ENABLED, 'E2E is opt-in: run with E2E=1 (spec §12.2)')
      await use(undefined)
    },
    { auto: true },
  ],
  alice: async ({ browser, baseURL }, use) => {
    const player = await makePlayer(browser, baseURL ?? '', 'alice')
    await use(player)
    await player.context.close()
  },
  bob: async ({ browser, baseURL }, use) => {
    const player = await makePlayer(browser, baseURL ?? '', 'bob')
    await use(player)
    await player.context.close()
  },
  spawnPlayer: async ({ browser, baseURL }, use) => {
    const created: Player[] = []
    await use(async (name) => {
      const player = await makePlayer(browser, baseURL ?? '', name)
      created.push(player)
      return player
    })
    await Promise.all(created.map((p) => p.context.close()))
  },
})

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

/**
 * The viewer's own hand: listbox 手札 with one option per card. (`MathCard` nests a second
 * `data-card` element inside each option, so count options, not `[data-card]`.)
 */
export const handCards = (page: Page): Locator =>
  page.getByRole('listbox', { name: '手札' }).getByRole('option')

/** The GAME SET dialog (Mantine modal titled GAME SET). */
export const gameSetDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'GAME SET' })

/** Card ids in the viewer's hand, in display order. */
export function handCardIds(page: Page): Promise<string[]> {
  return handCards(page).evaluateAll((els) =>
    els.map(
      (el) =>
        el.getAttribute('data-card') ??
        el.querySelector('[data-card]')?.getAttribute('data-card') ??
        '',
    ),
  )
}

/**
 * The board seats' shared-layout ids (`seat-<pid>`, the framer `layoutId` that carries a seat
 * from the waiting ring to the board), read from the DOM mirror `data-seat-anchor`, in order.
 */
export function seatLayoutIds(page: Page): Promise<string[]> {
  return page.locator('[data-seat-anchor]').evaluateAll((els) => {
    const ids = els.map((el) => `seat-${el.getAttribute('data-seat-anchor')}`)
    return ids.filter((id, i) => ids.indexOf(id) === i)
  })
}

/** The viewer's own pid: the self seat in the waiting ring or on the board. */
export async function selfPid(page: Page): Promise<string> {
  const seat = page
    .locator('[data-self="true"][data-seat-anchor], [data-self="true"][data-seat]')
    .first()
  await expect(seat).toBeAttached()
  const pid =
    (await seat.getAttribute('data-seat-anchor')) ?? (await seat.getAttribute('data-seat'))
  if (!pid || pid === 'empty') {
    throw new Error('self seat has no pid')
  }
  return pid
}

/** The pid of the seat whose turn it is on the board, or null outside a game. */
export function activeSeatPid(page: Page): Promise<string | null> {
  return page
    .locator('[data-seat-anchor][data-active="true"]')
    .first()
    .getAttribute('data-seat-anchor', { timeout: 1000 })
    .catch(() => null)
}

/** A numeric lobby counter on `/` (`data-counter` → NumberGlyph `data-value`); null while "—". */
export function lobbyCounter(
  page: Page,
  key: 'online' | 'lobby' | 'rooms',
): Promise<number | null> {
  return page
    .locator(`[data-counter="${key}"] [data-value]`)
    .first()
    .getAttribute('data-value', { timeout: 1000 })
    .then((v) => (v === null ? null : Number(v)))
    .catch(() => null)
}

/* ------------------------------------------------------------------ */
/* flows                                                               */
/* ------------------------------------------------------------------ */

/**
 * Opens a room. Without `roomPath` the player creates one through `/room/new` (which
 * redirects to a fresh prime id); with it, the player joins by URL. Returns the room path.
 */
export async function joinRoom(player: Player, roomPath?: string): Promise<string> {
  const { page } = player
  if (roomPath) {
    await page.goto(roomPath)
  } else {
    await page.goto('/room/new')
    await page.waitForURL(ROOM_PATH, { timeout: 30_000 })
  }
  await selfPid(page)
  return new URL(page.url()).pathname
}

/** Picks the time limit (seconds) in the waiting room; every member sees the stored rule. */
export async function setTimeLimit(page: Page, seconds: 15 | 60 | 300): Promise<void> {
  await page.locator('[aria-label="制限時間"]').getByText(String(seconds), { exact: true }).click()
  await expect(page.getByRole('radio', { name: String(seconds), exact: true })).toBeChecked()
}

/** Both players press 準備OK, `starter` presses ゲーム開始, and both boards show a hand. */
export async function readyAndStart(
  players: Player[],
  starter: Player = players[0],
): Promise<void> {
  for (const { page } of players) {
    await page.getByRole('button', { name: '準備OK' }).click()
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible()
  }
  const start = starter.page.getByRole('button', { name: 'ゲーム開始' })
  await expect(start).toBeEnabled()
  await start.click()
  for (const { page } of players) {
    await expect(handCards(page).first()).toBeVisible()
  }
}

/** Waits until both boards agree whose turn it is and returns that player. */
export async function currentTurnPlayer(players: Player[]): Promise<Player> {
  const pids = await Promise.all(players.map((p) => selfPid(p.page)))
  let current: string | null = null
  await expect
    .poll(async () => {
      const seen = await Promise.all(players.map((p) => activeSeatPid(p.page)))
      current = seen.every((s) => s !== null && s === seen[0]) ? seen[0] : null
      return current
    })
    .not.toBeNull()
  const index = pids.indexOf(current ?? '')
  if (index < 0) {
    throw new Error(`active seat ${current} is not one of the players`)
  }
  return players[index]
}

/** Presses パス for `player` (it must be their turn). */
export async function pass(player: Player): Promise<void> {
  const button = player.page.getByRole('button', { name: PASS_BUTTON })
  await expect(button).toBeEnabled()
  await button.click()
}

/** Makes it `target`'s turn by passing for the others, in turn order. */
export async function passUntilTurnOf(players: Player[], target: Player): Promise<void> {
  const targetPid = await selfPid(target.page)
  // at most one pass per other player reaches the target
  for (const _ of players) {
    const current = await currentTurnPlayer(players)
    if (current === target) {
      return
    }
    const passerPid = await selfPid(current.page)
    await pass(current)
    await expect.poll(() => activeSeatPid(target.page)).not.toBe(passerPid)
  }
  await expect.poll(() => activeSeatPid(target.page)).toBe(targetPid)
}

/** 退出 in the header, then 退出する in the confirmation dialog. */
export async function leaveRoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: '退出', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '部屋から退出しますか？' })
  await dialog.getByRole('button', { name: '退出する' }).click()
}
