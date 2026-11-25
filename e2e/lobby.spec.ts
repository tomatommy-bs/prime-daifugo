/**
 * Spec §12.2 scenario 8: the home page counters (オンライン, ロビー, 部屋) come from the lobby
 * socket. Counts are asserted relative to a baseline, so rooms left over from earlier specs or
 * runs (persisted local state) do not make the test flaky.
 */
import { expect, joinRoom, lobbyCounter, test } from './fixtures'

test('8. lobby counters on / reflect one room with two players', async ({
  alice,
  bob,
  spawnPlayer,
}) => {
  const watcher = await spawnPlayer('carol')
  await watcher.page.goto('/')
  await expect.poll(() => lobbyCounter(watcher.page, 'rooms')).not.toBeNull()
  await expect.poll(() => lobbyCounter(watcher.page, 'lobby')).toBeGreaterThanOrEqual(1)

  const baseRooms = (await lobbyCounter(watcher.page, 'rooms')) ?? 0
  const baseOnline = (await lobbyCounter(watcher.page, 'online')) ?? 0

  const roomPath = await joinRoom(alice)
  await joinRoom(bob, roomPath)

  await expect
    .poll(async () => ({
      rooms: await lobbyCounter(watcher.page, 'rooms'),
      online: await lobbyCounter(watcher.page, 'online'),
    }))
    .toEqual({ rooms: baseRooms + 1, online: baseOnline + 2 })
})
