/**
 * Bot seats E2E: one human adds two CPU seats in the waiting room, starts, and passes on every
 * turn; the bots play on their own (draws, plays, 57 cuts) until GAME SET.
 */
import {
  activeSeatPid,
  expect,
  gameSetDialog,
  handCards,
  joinRoom,
  pass,
  proofLog,
  selfPid,
  test,
} from './fixtures'

test('a human and two CPU seats play to GAME SET', async ({ alice }) => {
  test.setTimeout(240_000)
  const { page } = alice
  await joinRoom(alice)

  // 4 cards per hand: a short game
  const cards = page.locator('[aria-label="初期手札"]')
  await cards.getByText('4', { exact: true }).click()

  await page.getByRole('button', { name: 'CPU（ふつう）を追加' }).click()
  await page.getByRole('button', { name: 'CPU（つよい）を追加' }).click()
  await expect(page.locator('[data-seat="bot-1"]')).toHaveAttribute('data-bot', 'normal')
  await expect(page.locator('[data-seat="bot-2"]')).toHaveAttribute('data-bot', 'strong')

  // a bot can be taken out again and replaced
  await page.getByRole('button', { name: 'CPU2（つよい） を外す' }).click()
  await expect(page.locator('[data-seat="bot-2"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'CPU（よわい）を追加' }).click()
  await expect(page.locator('[data-seat="bot-2"]')).toHaveAttribute('data-bot', 'weak')

  await page.getByRole('button', { name: '準備OK' }).click()
  const start = page.getByRole('button', { name: 'ゲーム開始' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(handCards(page).first()).toBeVisible()

  const me = await selfPid(page)
  const deadline = Date.now() + 200_000
  while (!(await gameSetDialog(page).isVisible()) && Date.now() < deadline) {
    if ((await activeSeatPid(page)) === me && (await handCards(page).count()) > 0) {
      await pass(alice).catch(() => undefined)
    }
    await page.waitForTimeout(300)
  }
  await expect(gameSetDialog(page)).toBeVisible()
  await expect(gameSetDialog(page)).toContainText(/CPU/)
  // the bots' moves are in the proof log
  await expect(proofLog(page)).toContainText(/CPU/)
})
