/**
 * The local realtime Worker for E2E: `wrangler dev --local` on `RT_PORT` with the short session
 * vars, started by a worker-scoped fixture (not Playwright's `webServer`) so a test can kill it
 * and start it again on the same persisted Durable Object store (the "deploy mid-game" scenario,
 * RQ-S19 / RQ-O4).
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { ROOT, RT_PERSIST_DIR, RT_PORT, RT_URL, WORKER_VARS } from './env'

const START_TIMEOUT_MS = 120_000
const POLL_MS = 200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(`${RT_URL}/healthz`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

export class RealtimeServer {
  private child: ChildProcess | null = null
  private stderr = ''

  /** Start with an empty store: rooms and lobby rows from earlier runs must not leak in. */
  static async fresh(): Promise<RealtimeServer> {
    if (await healthy()) {
      throw new Error(`something already answers on ${RT_URL}; set E2E_RT_PORT to a free port`)
    }
    rmSync(RT_PERSIST_DIR, { recursive: true, force: true })
    const server = new RealtimeServer()
    await server.start()
    return server
  }

  async start(): Promise<void> {
    const vars = Object.entries(WORKER_VARS).flatMap(([k, v]) => ['--var', `${k}:${v}`])
    const args = [
      'wrangler',
      'dev',
      '-c',
      'worker/wrangler.jsonc',
      '--port',
      String(RT_PORT),
      '--local',
      '--persist-to',
      RT_PERSIST_DIR,
      ...vars,
    ]
    this.stderr = ''
    // its own process group, so a kill takes workerd down with it
    const child = spawn('npx', args, {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    child.stderr?.on('data', (d: Buffer) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000)
    })
    this.child = child
    const deadline = Date.now() + START_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`wrangler dev exited (${child.exitCode}):\n${this.stderr}`)
      }
      if (await healthy()) {
        return
      }
      await sleep(POLL_MS)
    }
    throw new Error(`wrangler dev did not answer on ${RT_URL}/healthz:\n${this.stderr}`)
  }

  /** SIGKILL the whole process group (wrangler and workerd) and wait until the port is free. */
  async kill(): Promise<void> {
    const child = this.child
    this.child = null
    if (child?.pid === undefined || child.exitCode !== null) {
      return
    }
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await exited
    for (let i = 0; i < 50 && (await healthy()); i += 1) {
      await sleep(POLL_MS)
    }
  }

  /** A crash and a restart on the same store, like a Worker deploy. */
  async restart(): Promise<void> {
    await this.kill()
    await this.start()
  }
}
