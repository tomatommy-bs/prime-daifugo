/**
 * Spec §12.2 scenarios 1-7: two players (alice, bob) against the local Worker with
 * GRACE_PLAYING_MS = GRACE_IDLE_MS = 5000 and AWAY_TURN_CAP_MS = 3000 (playwright.config.ts).
 * Timing is asserted with `expect.poll`; the only fixed wait is the 3 s network blip itself.
 */
import {
  AWAY_TURN_CAP_MS,
  GRACE_MS,
  type Player,
  activeSeatPid,
  currentTurnPlayer,
  drawCard,
  expect,
  gameSetDialog,
  handCardIds,
  handCards,
  joinRoom,
  leaveRoom,
  pass,
  passUntilTurnOf,
  proofLog,
  readyAndStart,
  seatLayoutIds,
  selfPid,
  setTimeLimit,
  test,
} from './fixtures'

const BLIP_MS = 3000
const PRIME_ROOM_PATH = /^\/room\/\d+$/
const DRAW_BUTTON = /引く/
const LEFT_NOTICE = /退出しました/
/** slack for reconnect backoff, the alarm and the broadcast on top of a server-side timer */
const SERVER_SLACK_MS = 10_000
/** the capped pass must land well before the 60 s turn would have run out */
const CAP_SLACK_MS = 5000

async function startGame(alice: Player, bob: Player, timeLimit?: 15 | 60 | 300) {
  const roomPath = await joinRoom(alice)
  await joinRoom(bob, roomPath)
  if (timeLimit) {
    await setTimeLimit(alice.page, timeLimit)
    await expect(
      bob.page.getByRole('radio', { name: String(timeLimit), exact: true }),
    ).toBeChecked()
  }
  await readyAndStart([alice, bob], alice)
  return roomPath
}

test.describe('room session (spec §12.2)', () => {
  test('1. create via /room/new, join by URL, ready, start and play', async ({ alice, bob }) => {
    const roomPath = await joinRoom(alice)
    expect(roomPath).toMatch(PRIME_ROOM_PATH)
    await joinRoom(bob, roomPath)

    // both members are listed in the waiting ring on both screens
    const [alicePid, bobPid] = [await selfPid(alice.page), await selfPid(bob.page)]
    for (const { page } of [alice, bob]) {
      await expect(page.locator(`[data-seat="${alicePid}"]`)).toBeVisible()
      await expect(page.locator(`[data-seat="${bobPid}"]`)).toBeVisible()
    }

    await readyAndStart([alice, bob], alice)
    expect(await seatLayoutIds(alice.page)).toEqual(
      expect.arrayContaining([`seat-${alicePid}`, `seat-${bobPid}`]),
    )

    // alice plays: get to her turn (bob passes if he leads), draw once, then pass
    await passUntilTurnOf([alice, bob], alice)
    const before = (await handCardIds(alice.page)).length
    await alice.page.getByRole('button', { name: DRAW_BUTTON }).click()
    await expect(handCards(alice.page)).toHaveCount(before + 1)
    await pass(alice)
    await expect.poll(() => activeSeatPid(alice.page)).toBe(bobPid)
    await expect.poll(() => activeSeatPid(bob.page)).toBe(bobPid)
  })

  test('2. bob reloads mid-game and keeps his seat, hand and the turn', async ({ alice, bob }) => {
    await startGame(alice, bob)
    const bobPid = await selfPid(bob.page)
    const seatsBefore = await seatLayoutIds(bob.page)
    const handBefore = await handCardIds(bob.page)
    const turnBefore = await activeSeatPid(bob.page)
    expect(seatsBefore).toContain(`seat-${bobPid}`)

    await bob.page.reload()

    await expect(handCards(bob.page).first()).toBeVisible()
    expect(await selfPid(bob.page)).toBe(bobPid)
    await expect.poll(() => seatLayoutIds(bob.page)).toEqual(seatsBefore)
    await expect.poll(() => handCardIds(bob.page)).toEqual(handBefore)
    await expect.poll(() => activeSeatPid(bob.page)).toBe(turnBefore)
    // alice never saw bob leave
    await expect(alice.page.getByText(LEFT_NOTICE)).toHaveCount(0)
  })

  test('3. a 3 s offline blip resumes the board by replay, with no leave notice', async ({
    alice,
    bob,
  }) => {
    await startGame(alice, bob)
    await passUntilTurnOf([alice, bob], alice)
    const handBefore = await handCardIds(bob.page)
    const aliceCards = (await handCardIds(alice.page)).length

    await bob.net.goOffline()
    const welcomesBefore = bob.net.frames().filter((f) => f.t === 'welcome').length
    // alice draws while bob is away: bob misses that event
    await drawCard(alice.page)
    // the blip itself is the scenario (shorter than the 5 s grace)
    await bob.page.waitForTimeout(BLIP_MS)
    await bob.net.goOnline()

    await expect(bob.page.locator('[data-connection="open"]')).toBeVisible({
      timeout: SERVER_SLACK_MS,
    })
    await expect.poll(() => handCardIds(bob.page)).toEqual(handBefore)
    // the missed draw came back as a replay (not a snapshot), and bob's board shows it
    await expect
      .poll(() =>
        bob.net
          .frames()
          .filter((f) => f.t === 'welcome')
          .slice(welcomesBefore)
          .map((f) => f.mode),
      )
      .toEqual(['replay'])
    await expect(
      bob.page.getByRole('group', { name: new RegExp(`^alice、手札 ${aliceCards + 1} 枚`) }),
    ).toBeVisible()
    await expect(gameSetDialog(alice.page)).toHaveCount(0)
    await expect(alice.page.getByText(LEFT_NOTICE)).toHaveCount(0)
    await expect(bob.page.getByText(LEFT_NOTICE)).toHaveCount(0)
  })

  test('4. bob offline on his turn is auto-passed after the capped deadline', async ({
    alice,
    bob,
  }) => {
    // 60 s turns: only the 3 s away cap can move the turn this fast (RQ-T3)
    await startGame(alice, bob)
    const alicePid = await selfPid(alice.page)
    const bobPid = await selfPid(bob.page)
    await passUntilTurnOf([alice, bob], bob)
    expect(await activeSeatPid(alice.page)).toBe(bobPid)

    await bob.net.goOffline()
    const offlineAt = Date.now()

    await expect
      .poll(() => activeSeatPid(alice.page), { timeout: AWAY_TURN_CAP_MS + SERVER_SLACK_MS })
      .toBe(alicePid)
    expect(Date.now() - offlineAt).toBeLessThan(AWAY_TURN_CAP_MS + CAP_SLACK_MS)
    // the server passed for him (RQ-T2), logged like any timeout
    await expect(proofLog(alice.page)).toContainText('時間切れです')
    // still within grace: no forfeit yet
    await expect(gameSetDialog(alice.page)).toHaveCount(0)
    await bob.net.goOnline()
  })

  test('5. bob offline past the grace forfeits and alice wins', async ({ alice, bob }) => {
    await startGame(alice, bob)
    await bob.net.goOffline()

    const dialog = gameSetDialog(alice.page)
    await expect(dialog).toBeVisible({ timeout: GRACE_MS + SERVER_SLACK_MS })
    await expect(dialog.locator('[data-theorem]')).toContainText('alice')
  })

  test('6. a duplicate tab supersedes the first, which can take the seat back', async ({
    alice,
    bob,
  }) => {
    const roomPath = await startGame(alice, bob)
    const handBefore = await handCardIds(bob.page)

    const second = await bob.context.newPage()
    await second.goto(roomPath)
    await expect(handCards(second).first()).toBeVisible()
    await expect(bob.page.getByText('別のタブで開かれています')).toBeVisible()

    await bob.page.getByRole('button', { name: 'このタブで再開' }).click()
    await expect(second.getByText('別のタブで開かれています')).toBeVisible()
    await expect(bob.page.getByText('別のタブで開かれています')).toHaveCount(0)
    await expect.poll(() => handCardIds(bob.page)).toEqual(handBefore)
    await expect(gameSetDialog(alice.page)).toHaveCount(0)
  })

  test('7. an explicit 退出 navigates home and removes bob for alice', async ({ alice, bob }) => {
    const roomPath = await joinRoom(alice)
    await joinRoom(bob, roomPath)
    const bobPid = await selfPid(bob.page)
    await expect(alice.page.locator(`[data-seat="${bobPid}"]`)).toBeVisible()

    await leaveRoom(bob.page)

    await bob.page.waitForURL((url) => url.pathname === '/')
    await expect(alice.page.locator(`[data-seat="${bobPid}"]`)).toHaveCount(0)
  })

  test('the turn order is shared by both boards', async ({ alice, bob }) => {
    await startGame(alice, bob)
    const current = await currentTurnPlayer([alice, bob])
    const other = current === alice ? bob : alice
    await pass(current)
    const otherPid = await selfPid(other.page)
    await expect.poll(() => activeSeatPid(alice.page)).toBe(otherPid)
    await expect.poll(() => activeSeatPid(bob.page)).toBe(otherPid)
  })
})
