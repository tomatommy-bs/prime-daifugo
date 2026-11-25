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
import { AWAY_TURN_CAP_MS, E2E_ENABLED, GRACE_MS } from './env'
import { RealtimeServer } from './realtime-server'

export { expect, AWAY_TURN_CAP_MS, E2E_ENABLED, GRACE_MS }

const ROOM_WS_PATH = /^\/rooms\/[A-Za-z0-9_-]{1,32}\/ws$/
const PASS_BUTTON = /パス/
const ROOM_PATH = /\/room\/(?!new$)[A-Za-z0-9_-]{1,32}$/

export type NetControl = {
  /** Offline, with every routed room socket closed; new room sockets are refused. */
  goOffline(): Promise<void>
  goOnline(): Promise<void>
  /** Every JSON frame the server sent to this context's room sockets, in arrival order. */
  frames(): { t: string; mode?: string; e?: { type: string } }[]
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
  const received: string[] = []
  await context.routeWebSocket(
    (url) => ROOM_WS_PATH.test(url.pathname),
    (ws) => {
      if (offline) {
        // like a connection that cannot be established; not a terminal 40xx close
        ws.close()
        return
      }
      const server = ws.connectToServer()
      // forward by hand so the frames can be recorded (page → server stays automatic)
      server.onMessage((message) => {
        if (typeof message === 'string') {
          received.push(message)
        }
        ws.send(message)
      })
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
    frames() {
      return received.flatMap((text) => {
        try {
          return [JSON.parse(text)]
        } catch {
          return [] // the bare `pong`
        }
      })
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

type WorkerFixtures = {
  /** auto: the local Worker for this Playwright worker (null without E2E=1) */
  realtime: RealtimeServer | null
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  realtime: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must destructure their first argument
    async ({}, use) => {
      const server = E2E_ENABLED ? await RealtimeServer.fresh() : null
      await use(server)
      await server?.kill()
    },
    { scope: 'worker', auto: true, timeout: 180_000 },
  ],
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

/* ------------------------------------------------------------------ */
/* playing cards                                                       */
/* ------------------------------------------------------------------ */

const RANK_VALUE: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 }
const GROTHENDIECK = 57

/** Card value (A=1, J=11, Q=12, K=13), from an id like `QS` or `10H`. */
export function cardValue(id: string): number {
  const rank = id.slice(0, -1)
  return RANK_VALUE[rank] ?? Number(rank)
}

/** The number several cards form side by side (RQ-R3). */
export function concatValue(ids: string[]): number {
  return Number(ids.map(cardValue).join(''))
}

const MR_BASES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37].map(BigInt)

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1)
  let b = base % mod
  let e = exp
  const zero = BigInt(0)
  const one = BigInt(1)
  const two = BigInt(2)
  while (e > zero) {
    if (e % two === one) {
      result = (result * b) % mod
    }
    b = (b * b) % mod
    e /= two
  }
  return result
}

/** Deterministic Miller-Rabin (exact far beyond the numbers a few cards can form). */
export function isPrime(n: number): boolean {
  if (n < 2) {
    return false
  }
  for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) {
    if (n % p === 0) {
      return n === p
    }
  }
  const big = BigInt(n)
  const one = BigInt(1)
  let d = big - one
  let r = 0
  while (d % BigInt(2) === BigInt(0)) {
    d /= BigInt(2)
    r += 1
  }
  outer: for (const a of MR_BASES) {
    let x = modPow(a, d, big)
    if (x === one || x === big - one) {
      continue
    }
    for (let i = 1; i < r; i += 1) {
      x = (x * x) % big
      if (x === big - one) {
        continue outer
      }
    }
    return false
  }
  return true
}

/** Ordered selections of `k` distinct cards from `hand`. */
function* permutations(hand: string[], k: number, used: string[] = []): Generator<string[]> {
  if (used.length === k) {
    yield used
    return
  }
  for (const card of hand) {
    if (!used.includes(card)) {
      yield* permutations(hand, k, [...used, card])
    }
  }
}

/**
 * A legal plain play (prime or 57, beating the top set with the same card count). On an empty
 * field `prefer` picks the largest set (a hand can go out in one play) or the smallest one (a
 * longer game). Null when there is none.
 */
export function findPrimePlay(
  hand: string[],
  top: string[],
  { maxCards = 4, prefer = 'largest' }: { maxCards?: number; prefer?: 'largest' | 'smallest' } = {},
): string[] | null {
  const sizes = top.length > 0 ? [top.length] : []
  if (top.length === 0) {
    for (let k = Math.min(hand.length, maxCards, 5); k >= 1; k -= 1) {
      sizes.push(k)
    }
    if (prefer === 'smallest') {
      sizes.reverse()
    }
  }
  const floor = top.length > 0 ? concatValue(top) : 0
  for (const k of sizes) {
    for (const set of permutations(hand, k)) {
      const n = concatValue(set)
      if (n > floor && (isPrime(n) || n === GROTHENDIECK)) {
        return set
      }
    }
  }
  return null
}

/** A card (or two adjacent cards) that reads as `p`, taken from `pool`. */
function primeTokens(p: number, pool: string[]): string[][] {
  const out: string[][] = []
  for (const a of pool) {
    if (cardValue(a) === p) {
      out.push([a])
    }
  }
  for (const set of permutations(pool, 2)) {
    if (concatValue(set) === p) {
      out.push(set)
    }
  }
  return out
}

function primeFactors(n: number): [number, number][] {
  const out: [number, number][] = []
  let m = n
  for (let p = 2; p * p <= m; p += 1) {
    let e = 0
    while (m % p === 0) {
      m /= p
      e += 1
    }
    if (e > 0) {
      out.push([p, e])
    }
  }
  if (m > 1) {
    out.push([m, 1])
  }
  return out
}

const without = (pool: string[], used: string[]) => pool.filter((c) => !used.includes(c))

/** Factor tokens for `p^e`: `p * p * …` or `p ^ e` (one level, RQ-R16), with what is left. */
function* powerTerms(p: number, e: number, pool: string[]): Generator<[string[], string[]]> {
  for (const base of primeTokens(p, pool)) {
    const rest = without(pool, base)
    if (e >= 2) {
      for (const exp of rest) {
        if (cardValue(exp) === e) {
          yield [[...base, '^', exp], without(rest, [exp])]
        }
      }
    }
    if (e === 1) {
      yield [base, rest]
    } else {
      for (const [more, left] of powerTerms(p, e - 1, rest)) {
        yield [[...base, '*', ...more], left]
      }
    }
  }
}

function* factorExpressions(factors: [number, number][], pool: string[]): Generator<string[]> {
  if (factors.length === 0) {
    yield []
    return
  }
  const [[p, e], ...rest] = factors
  for (const [term, left] of powerTerms(p, e, pool)) {
    for (const tail of factorExpressions(rest, left)) {
      yield tail.length > 0 ? [...term, '*', ...tail] : term
    }
  }
}

/**
 * A correct factorization play from `hand` on an empty field: 1-2 cards forming a composite
 * number, and its prime factorization written with other cards of the hand. Null when none.
 */
export function findFactorPlay(hand: string[]): { submit: string[]; factor: string[] } | null {
  for (const k of [1, 2]) {
    for (const submit of permutations(hand, k)) {
      const n = concatValue(submit)
      if (n < 4 || isPrime(n) || n === GROTHENDIECK) {
        continue
      }
      const factors = primeFactors(n)
      if (factors.length === 1 && factors[0][1] === 1) {
        continue
      }
      for (const factor of factorExpressions(factors, without(hand, submit))) {
        // at least one operator, and never a lone 1 (no A as an operand)
        if (factor.some((t) => t === '*' || t === '^')) {
          return { submit, factor }
        }
      }
    }
  }
  return null
}

/** A single card or a pair that is neither prime nor 57 (a not-prime penalty, RQ-R15). */
export function findNotPrimePlay(hand: string[]): string[] | null {
  for (const k of [1, 2]) {
    for (const set of permutations(hand, k)) {
      const n = concatValue(set)
      if (!isPrime(n) && n !== GROTHENDIECK) {
        return set
      }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* board reads and moves                                               */
/* ------------------------------------------------------------------ */

/** The proof log (証明ログ): every board event is written here. */
export const proofLog = (page: Page): Locator => page.getByRole('region', { name: '証明ログ' })

/** Card ids of the field's top set, or [] on an empty field. */
export function fieldTopIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-field-top] [data-card]')
    .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-card') ?? ''))])
}

const actions = (page: Page) => page.getByRole('group', { name: '操作' })

/** Clicks one hand card (into the submit tray, or into the factor panel in factor mode). */
export async function clickHandCard(page: Page, id: string): Promise<void> {
  await page
    .getByRole('listbox', { name: '手札' })
    .locator(`[role="option"][data-card="${id}"], [role="option"]:has([data-card="${id}"])`)
    .first()
    .click()
}

const trayCards = (page: Page) => page.getByRole('listbox', { name: '提出' }).getByRole('option')
const factorTokens = (page: Page) => page.getByRole('listbox', { name: /因数/ }).getByRole('option')

async function fillTray(page: Page, submit: string[], factor: string[]): Promise<void> {
  for (const id of submit) {
    await clickHandCard(page, id)
  }
  await expect(trayCards(page)).toHaveCount(submit.length, { timeout: 2000 })
  if (factor.length > 0) {
    await actions(page)
      .getByRole('button', { name: /^素因数分解/ })
      .click()
    for (const token of factor) {
      if (token === '*') {
        await page.getByRole('button', { name: '掛ける', exact: true }).click()
      } else if (token === '^') {
        await page.getByRole('button', { name: '累乗', exact: true }).click()
      } else {
        await clickHandCard(page, token)
      }
    }
    await expect(factorTokens(page)).toHaveCount(factor.length, { timeout: 2000 })
  }
}

/**
 * Puts `submit` in the tray, writes `factor` in the factor panel (cards plus the 掛ける / 累乗
 * buttons), then presses 出す. A server event that lands meanwhile empties the tray (by design:
 * every event resets it), so the tray is filled again when that happens.
 */
export async function submitCards(
  page: Page,
  submit: string[],
  factor: string[] = [],
): Promise<void> {
  const submitButton = actions(page).getByRole('button', { name: /^出す/ })
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fillTray(page, submit, factor)
      await expect(submitButton).toBeEnabled({ timeout: 2000 })
      break
    } catch (err) {
      if (attempt >= 3) {
        throw err
      }
      const reset = page.getByRole('button', { name: 'リセット' })
      if (await reset.isEnabled()) {
        await reset.click()
      }
    }
  }
  await submitButton.click()
}

/** Presses 引く and waits for the drawn card. */
export async function drawCard(page: Page): Promise<void> {
  const before = await handCards(page).count()
  await page.getByRole('button', { name: /引く/ }).click()
  await expect(handCards(page)).toHaveCount(before + 1)
}

/** Whether 引く is enabled (my turn, draw right left, deck not empty). */
export function canDraw(page: Page): Promise<boolean> {
  return page.getByRole('button', { name: /引く/ }).isEnabled()
}
