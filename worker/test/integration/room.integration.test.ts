/**
 * L3: the real `RoomDO` in local workerd (spec §12 L3). Real short waits; keep them few.
 * Uses Node 22's global WebSocket. Opt-in: `INTEGRATION=1 npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PV } from '../../../src/shared/ids'
import type { RoomServerFrame, View } from '../../../src/shared/protocol'
import {
  type RunningWorker,
  TEST_ORIGIN,
  makePersistDir,
  removePersistDir,
  TEST_VARS,
  startWorker,
} from './start-worker'

const sid = (n: number) => `itest${String(n).padStart(38, '0')}`

type Frame = RoomServerFrame & Record<string, any>

class Client {
  readonly frames: Frame[] = []
  closeCode: number | null = null
  private readonly ws: WebSocket
  private waiters: (() => void)[] = []
  private cmdNo = 0

  constructor(url: string) {
    this.ws = new WebSocket(url, { headers: { origin: TEST_ORIGIN } } as never)
    this.ws.addEventListener('message', (ev) => {
      if (ev.data !== 'pong') {
        this.frames.push(JSON.parse(String(ev.data)))
        this.notify()
      }
    })
    this.ws.addEventListener('close', (ev) => {
      this.closeCode = ev.code
      this.notify()
    })
  }

  static async open(
    worker: RunningWorker,
    roomId: string,
    n: number,
    extra: { lastSeq?: number | null; epoch?: string | null } = {},
  ): Promise<Client> {
    const c = new Client(`${worker.wsUrl}/rooms/${roomId}/ws`)
    await new Promise<void>((resolve, reject) => {
      c.ws.addEventListener('open', () => resolve())
      c.ws.addEventListener('error', () => reject(new Error('socket error')))
    })
    c.ws.send(
      JSON.stringify({
        t: 'hello',
        pv: PV,
        sid: sid(n),
        name: `user${n}`,
        lastSeq: extra.lastSeq ?? null,
        epoch: extra.epoch ?? null,
      }),
    )
    await c.waitFor((f) => f.t === 'welcome' || f.t === 'bye')
    return c
  }

  private notify(): void {
    const w = this.waiters
    this.waiters = []
    for (const fn of w) {
      fn()
    }
  }

  /** Resolve with the first frame (seen so far or later) matching `pred`. */
  waitFor(pred: (f: Frame) => boolean, timeoutMs = 5_000): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out; frames: ${JSON.stringify(this.frames.slice(-5))}`)),
        timeoutMs,
      )
      const check = () => {
        const hit = this.frames.find(pred)
        if (hit) {
          clearTimeout(timer)
          resolve(hit)
        } else {
          this.waiters.push(check)
        }
      }
      check()
    })
  }

  waitClose(timeoutMs = 5_000): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no close')), timeoutMs)
      const check = () => {
        if (this.closeCode !== null) {
          clearTimeout(timer)
          resolve(this.closeCode)
        } else {
          this.waiters.push(check)
        }
      }
      check()
    })
  }

  async cmd(c: Record<string, unknown>): Promise<Frame> {
    this.cmdNo += 1
    const id = `c${this.cmdNo}`
    this.ws.send(JSON.stringify({ t: 'cmd', id, c }))
    return this.waitFor((f) => f.t === 'ack' && f.id === id)
  }

  get welcome(): Frame {
    return this.frames.find((f) => f.t === 'welcome') as Frame
  }

  /** The latest full view this client has (welcome snapshot or evt snap). */
  get view(): View {
    for (let i = this.frames.length - 1; i >= 0; i -= 1) {
      const f = this.frames[i]
      if ((f.t === 'evt' || f.t === 'welcome') && f.snap) {
        return f.snap
      }
    }
    throw new Error('no view yet')
  }

  get lastSeq(): number {
    let seq = 0
    for (const f of this.frames) {
      if (f.t === 'evt' || f.t === 'welcome') {
        seq = Math.max(seq, f.seq)
      }
    }
    return seq
  }

  close(): void {
    this.ws.close()
  }
}

let roomCounter = 0
const nextRoom = () => {
  roomCounter += 1
  return `itest-${Date.now().toString(36)}-${roomCounter}`
}

/** alice (1) and bob (2) join, set a 15 s turn, ready up and start. */
async function startGame(worker: RunningWorker, roomId: string) {
  const a = await Client.open(worker, roomId, 1)
  const b = await Client.open(worker, roomId, 2)
  expect((await a.cmd({ type: 'set-rule', rule: { timeLimit: 15 } })).ok).toBe(true)
  expect((await a.cmd({ type: 'ready' })).ok).toBe(true)
  expect((await b.cmd({ type: 'ready' })).ok).toBe(true)
  const version = a.view.version
  expect((await a.cmd({ type: 'start', expectedVersion: version })).ok).toBe(true)
  await a.waitFor((f) => f.t === 'evt' && f.e.type === 'game-started')
  await b.waitFor((f) => f.t === 'evt' && f.e.type === 'game-started')
  return { a, b }
}

describe('RoomDO in workerd', () => {
  let worker: RunningWorker
  let persistDir: string
  const clients: Client[] = []
  const track = <T extends Client>(c: T) => {
    clients.push(c)
    return c
  }

  beforeAll(async () => {
    persistDir = makePersistDir()
    worker = await startWorker(persistDir)
  })

  afterAll(async () => {
    for (const c of clients) {
      c.close()
    }
    await worker?.dispose()
    removePersistDir(persistDir)
  })

  it('hello → welcome snapshot with a stable selfId', async () => {
    const roomId = nextRoom()
    const a = track(await Client.open(worker, roomId, 1))
    expect(a.welcome).toMatchObject({ t: 'welcome', pv: PV, mode: 'snapshot', seq: 1 })
    expect(a.welcome.selfId).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(a.view.members.map((m) => m.name)).toEqual(['user1'])
    const info = await (await fetch(`${worker.url}/rooms/${roomId}`)).json()
    expect(info).toMatchObject({ exists: true, status: 'waiting', members: 1, connected: 1 })
  })

  it('a second socket with the same sid supersedes the first (4001)', async () => {
    const roomId = nextRoom()
    const first = track(await Client.open(worker, roomId, 1))
    const second = track(await Client.open(worker, roomId, 1))
    expect(await first.waitClose()).toBe(4001)
    expect(first.frames.at(-1)).toEqual({ t: 'bye', reason: 'superseded' })
    expect(second.welcome.selfId).toBe(first.welcome.selfId)
  })

  it('a forced close and reconnect within grace replays the missed events', async () => {
    const roomId = nextRoom()
    const a = track(await Client.open(worker, roomId, 1))
    const b = track(await Client.open(worker, roomId, 2))
    await a.waitFor((f) => f.t === 'evt' && f.seq === 2)
    const lastSeq = a.lastSeq
    const epoch = a.welcome.epoch
    a.close()
    await b.waitFor((f) => f.t === 'evt' && f.e.type === 'presence' && f.seq === 3)
    await b.cmd({ type: 'ready' })
    const a2 = track(await Client.open(worker, roomId, 1, { lastSeq, epoch }))
    expect(a2.welcome).toMatchObject({ mode: 'replay', selfId: a.welcome.selfId })
    await a2.waitFor((f) => f.t === 'evt' && f.seq === a2.welcome.seq)
    const replayed = a2.frames.filter((f) => f.t === 'evt').map((f) => f.seq)
    expect(replayed[0]).toBe(lastSeq + 1)
    expect(replayed.at(-1)).toBe(a2.welcome.seq)
  })

  it('reconnecting with the same sid restores the same seat and hand', async () => {
    const { a, b } = await startGame(worker, nextRoom())
    track(a)
    track(b)
    const hand = b.view.game?.hand
    expect(hand?.length).toBeGreaterThan(0)
    const roomId = b.view.roomId
    b.close()
    const b2 = track(
      await Client.open(worker, roomId, 2, { lastSeq: b.lastSeq, epoch: b.welcome.epoch }),
    )
    await b2.waitFor((f) => f.t === 'evt' && f.seq === b2.welcome.seq)
    expect(b2.welcome.selfId).toBe(b.welcome.selfId)
    expect(b2.view.game?.hand).toEqual(hand)
    expect(b2.view.game?.playOrder).toContain(b2.welcome.selfId)
  })

  it('the alarm passes for a disconnected current player, then grace expiry forfeits', async () => {
    const { a, b } = await startGame(worker, nextRoom())
    track(a)
    track(b)
    const current = a.view.game?.currentPlayer
    const [away, stay] = current === a.welcome.selfId ? [a, b] : [b, a]
    away.close()
    // AWAY_TURN_CAP_MS=1000: the server passes for the away player through the alarm
    const passed = await stay.waitFor(
      (f) => f.t === 'evt' && f.e.type === 'passed' && f.e.reason === 'timeout',
      4_000,
    )
    expect(passed.e.by).toBe(away.welcome.selfId)
    // GRACE_PLAYING_MS=1500: then the away player forfeits and the other seat wins
    const ended = await stay.waitFor((f) => f.t === 'evt' && f.e.type === 'game-ended', 4_000)
    expect(ended.e).toMatchObject({ winnerId: stay.welcome.selfId, reason: 'last-standing' })
    const forfeited = stay.frames.find((f) => f.t === 'evt' && f.e.type === 'forfeited')
    expect(forfeited?.e).toMatchObject({ pid: away.welcome.selfId, reason: 'grace' })
    expect(stay.view.members.map((m) => m.id)).not.toContain(away.welcome.selfId)
  })

  it('a restart on the same persist dir keeps the game and floors the deadline at now + 10 s', async () => {
    const roomId = nextRoom()
    const { a, b } = await startGame(worker, roomId)
    const handA = a.view.game?.hand
    const epoch = a.welcome.epoch
    const turn = a.view.game?.turn
    // a deploy kills the process: the object never sees these sockets close
    await worker.dispose()
    track(a)
    track(b)
    worker = await startWorker(persistDir)
    const before = Date.now()
    const a2 = track(await Client.open(worker, roomId, 1))
    expect(a2.welcome).toMatchObject({ mode: 'snapshot', epoch })
    const game = a2.view.game
    expect(a2.view.status).toBe('playing')
    expect(game?.hand).toEqual(handA)
    expect(game?.turn).toBe(turn)
    expect(game?.deadline ?? 0).toBeGreaterThanOrEqual(before + 10_000 - 500)
  })
})

describe('RoomDO in workerd: room GC', () => {
  let worker: RunningWorker
  let persistDir: string
  const clients: Client[] = []

  beforeAll(async () => {
    persistDir = makePersistDir()
    worker = await startWorker(persistDir, {
      ...TEST_VARS,
      GRACE_IDLE_MS: '300',
      ROOM_TTL_IDLE_MS: '1000',
    })
  })

  afterAll(async () => {
    for (const c of clients) {
      c.close()
    }
    await worker?.dispose()
    removePersistDir(persistDir)
  })

  it('the same object serves a new room after GC wiped the old one', async () => {
    const roomId = nextRoom()
    const a = await Client.open(worker, roomId, 1)
    clients.push(a)
    const oldEpoch = a.welcome.epoch
    a.close()
    // grace (0.3 s) then the idle TTL (1 s), then the alarm runs the GC
    await new Promise((r) => setTimeout(r, 3_000))
    const info = await (await fetch(`${worker.url}/rooms/${roomId}`)).json()
    expect(info).toMatchObject({ exists: false })
    const b = await Client.open(worker, roomId, 2)
    clients.push(b)
    expect(b.welcome).toMatchObject({ t: 'welcome', mode: 'snapshot', seq: 1 })
    expect(b.welcome.epoch).not.toBe(oldEpoch)
    expect(b.view.members.map((m) => m.name)).toEqual(['user2'])
  })
})
