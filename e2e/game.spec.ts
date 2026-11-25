/**
 * Gameplay and robustness E2E beyond spec §12.2's eight scenarios (integration):
 * - three players play a whole game to GAME SET with real legal primes;
 * - a correct factorization play, and a not-prime penalty;
 * - an observer joins mid-game, watches, and takes a seat in the next round;
 * - the Worker is killed and restarted mid-game (like a deploy) and the game resumes.
 */
import {
  type Player,
  activeSeatPid,
  canDraw,
  currentTurnPlayer,
  drawCard,
  expect,
  fieldTopIds,
  findFactorPlay,
  findNotPrimePlay,
  findPrimePlay,
  gameSetDialog,
  handCardIds,
  handCards,
  joinRoom,
  leaveRoom,
  pass,
  passUntilTurnOf,
  proofLog,
  readyAndStart,
  selfPid,
  submitCards,
  test,
} from './fixtures'

const NEXT_ROUND_JOIN = '次のラウンドに参加'
const NEXT_ROUND_START = /次のラウンドを開始/
const SETTLE_MS = 5000

/** The seats in the turn order (observers are listed apart, under 観戦). */
const seatsInTurnOrder = (page: Player['page']) =>
  page.getByRole('list', { name: /手番順/ }).getByRole('listitem')

/** Picks 4 cards per hand (fewer turns to an empty hand) in the waiting room. */
async function setInitialCards(page: Player['page'], n: 4 | 8 | 11) {
  const group = page.locator('[aria-label="初期手札"]')
  await group.getByText(String(n), { exact: true }).click()
  await expect(group.getByRole('radio', { name: String(n), exact: true })).toBeChecked()
}

/** GAME SET on any board, or a seat that has gone out (the dialog may still be on its way). */
async function gameOver(players: Player[]): Promise<boolean> {
  for (const { page } of players) {
    if ((await gameSetDialog(page).isVisible()) || (await handCards(page).count()) === 0) {
      return true
    }
  }
  return false
}

async function openRoom(players: Player[]): Promise<string> {
  const roomPath = await joinRoom(players[0])
  for (const p of players.slice(1)) {
    await joinRoom(p, roomPath)
  }
  return roomPath
}

/** Go out with the last two cards when they make a prime; otherwise play as few cards as possible. */
function choosePlay(hand: string[], top: string[]): string[] | null {
  if (top.length === 0 && hand.length <= 2) {
    const all = findPrimePlay(hand, top, { maxCards: hand.length })
    if (all?.length === hand.length) {
      return all
    }
  }
  return findPrimePlay(hand, top, { prefer: 'smallest' })
}

/**
 * One turn for `p`: play a legal prime if there is one (drawing once first if needed), else
 * pass. Returns once the server has applied the move.
 */
async function playTurn(p: Player, everyone: Player[]): Promise<void> {
  const { page } = p
  const me = await selfPid(page)
  let hand = await handCardIds(page)
  const top = await fieldTopIds(page)
  let play = choosePlay(hand, top)
  if (play === null && (await canDraw(page))) {
    await drawCard(page)
    hand = await handCardIds(page)
    play = choosePlay(hand, top)
  }
  if (play !== null) {
    const expected = hand.length - play.length
    await submitCards(page, play)
    await expect
      .poll(async () =>
        (await gameSetDialog(page).isVisible()) ? expected : await handCards(page).count(),
      )
      .toBe(expected)
    return
  }
  await pass(p)
  await expect
    .poll(async () => {
      const seen = await Promise.all(everyone.map((x) => activeSeatPid(x.page)))
      return seen.every((s) => s !== me)
    })
    .toBe(true)
}

test.describe('gameplay', () => {
  test('three players play a whole game to GAME SET', async ({ alice, bob, spawnPlayer }) => {
    test.setTimeout(300_000)
    const carol = await spawnPlayer('carol')
    const players = [alice, bob, carol]
    await openRoom(players)
    await setInitialCards(alice.page, 4)
    await readyAndStart(players, alice)
    for (const { page } of players) {
      await expect(handCards(page)).toHaveCount(4)
      await expect(seatsInTurnOrder(page)).toHaveCount(3)
    }

    let turns = 0
    for (let turn = 0; turn < 150; turn += 1) {
      if (await gameOver(players)) {
        break
      }
      let current: Player | null = null
      await expect
        .poll(async () => {
          if (await gameOver(players)) {
            return 'ended'
          }
          current = await currentTurnPlayer(players).catch(() => null)
          return current ? 'turn' : null
        })
        .not.toBeNull()
      if (current === null || (await gameOver(players))) {
        break
      }
      await playTurn(current, players)
      turns += 1
    }
    test.info().annotations.push({ type: 'turns', description: String(turns) })

    // everyone sees GAME SET with the same winner, whose hand is empty
    for (const { page } of players) {
      await expect(gameSetDialog(page)).toBeVisible()
    }
    const theorem = await gameSetDialog(alice.page).locator('[data-theorem]').innerText()
    const winner = players.find((p) => theorem.includes(p.name))
    expect(winner, theorem).toBeDefined()
    await expect(handCards((winner as Player).page)).toHaveCount(0)
    for (const { page } of players) {
      await expect(gameSetDialog(page).locator('[data-theorem]')).toContainText(
        (winner as Player).name,
      )
    }
  })

  test('a correct factorization is accepted', async ({ alice, bob }) => {
    test.setTimeout(180_000)
    await openRoom([alice, bob])
    await readyAndStart([alice, bob], alice)
    let play: { submit: string[]; factor: string[] } | null = null
    // nobody plays, so the field stays empty; alice draws one card a turn until she can factor
    for (let round = 0; round < 15 && play === null; round += 1) {
      await passUntilTurnOf([alice, bob], alice)
      play = findFactorPlay(await handCardIds(alice.page))
      if (play === null && (await canDraw(alice.page))) {
        await drawCard(alice.page)
        play = findFactorPlay(await handCardIds(alice.page))
      }
      if (play === null) {
        await pass(alice)
      }
    }
    expect(play, 'no factorizable hand within 15 rounds').not.toBeNull()
    const { submit, factor } = play as { submit: string[]; factor: string[] }
    const before = await handCards(alice.page).count()
    const used = submit.length + factor.filter((t) => t !== '*' && t !== '^').length
    await submitCards(alice.page, submit, factor)

    // the submitted cards make the field; the factor cards go back into the deck
    await expect(handCards(alice.page)).toHaveCount(before - used)
    await expect.poll(() => fieldTopIds(bob.page)).toEqual(submit)
    for (const { page } of [alice, bob]) {
      await expect(proofLog(page)).toContainText('を出しました')
      await expect(proofLog(page)).not.toContainText('等式が間違っています')
    }
  })

  test('a number that is not prime costs a penalty draw and ends the turn', async ({
    alice,
    bob,
  }) => {
    await openRoom([alice, bob])
    await readyAndStart([alice, bob], alice)
    await passUntilTurnOf([alice, bob], alice)
    const hand = await handCardIds(alice.page)
    const set = findNotPrimePlay(hand)
    expect(set, `no composite in ${hand.join(',')}`).not.toBeNull()
    const bobPid = await selfPid(bob.page)

    await submitCards(alice.page, set as string[])

    // the cards stay in the hand and one penalty card per submitted card is drawn
    await expect(handCards(alice.page)).toHaveCount(hand.length + (set as string[]).length)
    for (const { page } of [alice, bob]) {
      await expect(proofLog(page)).toContainText('素数ではありません')
      await expect.poll(() => activeSeatPid(page)).toBe(bobPid)
    }
    await expect.poll(() => fieldTopIds(bob.page)).toEqual([])
  })

  test('an observer joins mid-game and takes a seat in the next round', async ({
    alice,
    bob,
    spawnPlayer,
  }) => {
    const roomPath = await openRoom([alice, bob])
    await readyAndStart([alice, bob], alice)
    const carol = await spawnPlayer('carol')
    await joinRoom(carol, roomPath)

    // carol watches: no hand, no turn, listed as an observer for everyone
    await expect(carol.page.getByRole('group', { name: 'carol（あなた）、観戦' })).toBeVisible()
    await expect(handCards(carol.page)).toHaveCount(0)
    await expect(seatsInTurnOrder(carol.page)).toHaveCount(2)
    await expect(alice.page.getByRole('group', { name: 'carol、観戦' })).toBeVisible()

    // bob leaves: alice wins as the last seat standing
    await leaveRoom(bob.page)
    await bob.page.waitForURL((url) => url.pathname === '/')
    for (const { page } of [alice, carol]) {
      await expect(gameSetDialog(page)).toBeVisible()
      await expect(gameSetDialog(page).locator('[data-theorem]')).toContainText('alice')
    }

    // carol opts in from the GAME SET dialog; alice (still ready) starts round 2
    await gameSetDialog(carol.page).getByRole('button', { name: NEXT_ROUND_JOIN }).click()
    await expect(gameSetDialog(carol.page).getByRole('button', { name: '取消' })).toBeVisible()
    const start = gameSetDialog(alice.page).getByRole('button', { name: NEXT_ROUND_START })
    await expect(start).toBeEnabled()
    await start.click()
    for (const { page } of [alice, carol]) {
      await expect(handCards(page).first()).toBeVisible()
      await expect(seatsInTurnOrder(page)).toHaveCount(2)
    }
    const carolPid = await selfPid(carol.page)
    await expect(alice.page.locator(`[data-seat-anchor="${carolPid}"]`).first()).toBeAttached()
  })

  test('a Worker restart mid-game keeps every seat, hand and the turn', async ({
    alice,
    bob,
    realtime,
  }) => {
    test.skip(realtime === null, 'needs the local Worker')
    await openRoom([alice, bob])
    await readyAndStart([alice, bob], alice)
    const players = [alice, bob]
    // one move first, so the stored state is past the deal
    await pass(await currentTurnPlayer(players))
    const turnBefore = await currentTurnPlayer(players)
    const turnPid = await selfPid(turnBefore.page)
    const hands = await Promise.all(players.map((p) => handCardIds(p.page)))

    await realtime?.restart()
    // skip the reconnect backoff, as a phone coming back online would
    for (const { page } of players) {
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
    }

    for (const [i, { page }] of players.entries()) {
      await expect(page.locator('[data-connection="open"]')).toBeVisible({ timeout: SETTLE_MS * 4 })
      await expect.poll(() => handCardIds(page)).toEqual(hands[i])
      await expect.poll(() => activeSeatPid(page)).toBe(turnPid)
      await expect(gameSetDialog(page)).toHaveCount(0)
    }
    // and the game goes on
    await pass(turnBefore)
    const other = turnBefore === alice ? bob : alice
    const otherPid = await selfPid(other.page)
    for (const { page } of players) {
      await expect.poll(() => activeSeatPid(page)).toBe(otherPid)
    }
  })
})
