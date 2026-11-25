import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type RunningWorker,
  TEST_ORIGIN,
  makePersistDir,
  removePersistDir,
  startWorker,
} from './start-worker'

let worker: RunningWorker

beforeAll(async () => {
  worker = await startWorker(makePersistDir())
})

afterAll(async () => {
  await worker?.dispose()
  if (worker) {
    removePersistDir(worker.persistDir)
  }
})

const isPrime = (n: number) => {
  if (n < 2) {
    return false
  }
  for (let d = 2; d * d <= n; d += 1) {
    if (n % d === 0) {
      return false
    }
  }
  return true
}

describe('Worker router and LobbyDO (workerd)', () => {
  it('serves /healthz', async () => {
    const res = await fetch(`${worker.url}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('POST /rooms returns distinct primes', async () => {
    const ids: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${worker.url}/rooms`, { method: 'POST' })
      expect(res.status).toBe(200)
      ids.push(((await res.json()) as { roomId: string }).roomId)
    }
    expect(new Set(ids).size).toBe(5)
    for (const id of ids) {
      expect(isPrime(Number(id))).toBe(true)
    }
  })

  it('GET /rooms/:id reports a room that does not exist yet', async () => {
    const res = await fetch(`${worker.url}/rooms/never-used`)
    expect(await res.json()).toEqual({
      exists: false,
      status: null,
      members: 0,
      connected: 0,
      capacity: 12,
    })
  })

  it('404s a bad room id and 403s an upgrade from a foreign Origin', async () => {
    expect((await fetch(`${worker.url}/rooms/bad.id`)).status).toBe(404)
    // fetch() cannot send an upgrade header, so try a real socket: the handshake must fail
    const ws = new WebSocket(`${worker.wsUrl}/rooms/1009/ws`, {
      headers: { origin: 'http://evil.test' },
    } as never)
    const outcome = await new Promise<string>((resolve) => {
      ws.addEventListener('open', () => resolve('open'))
      ws.addEventListener('error', () => resolve('error'))
    })
    expect(outcome).toBe('error')
    const info = await fetch(`${worker.url}/rooms/1009`)
    expect(((await info.json()) as { exists: boolean }).exists).toBe(false)
  })

  it('a lobby socket gets the stats at once', async () => {
    const ws = new WebSocket(`${worker.wsUrl}/lobby`, { headers: { origin: TEST_ORIGIN } } as never)
    const first = await new Promise<unknown>((resolve, reject) => {
      ws.addEventListener('message', (ev) => resolve(JSON.parse(String(ev.data))))
      ws.addEventListener('error', () => reject(new Error('lobby socket error')))
    })
    expect(first).toMatchObject({ t: 'lobby', lobby: 1 })
    ws.close()
  })
})
