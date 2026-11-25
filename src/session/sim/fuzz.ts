/**
 * Seeded fuzz driver for the session simulator (spec §12.1). Random commands and faults against
 * the real reducer, with every invariant checked after every clock step, a caught-up view check
 * after every action, and a liveness drain at the end. The engine and the move policy are
 * injected so integration can run the same fuzz with the real engine.
 */
import type { CardId, GameEngine, Move } from '../../game/types'
import type { View } from '../../shared/protocol'
import { type Rng, mulberry32, randomInt } from '../../shared/rng'
import { ALLOWED_RULES } from '../../shared/rule-options'
import type { RoomConfig } from '../types'
import type { ClientModel, MinimalClientState, SimClient } from './sim-client'
import { SWEEP_INTERVAL_MS, SWEEP_STALE_MS } from './sim-host'
import { SimWorld } from './world'

/** Chooses a move for the current player from what its client sees. */
export type MovePolicy = (view: View, rng: Rng) => Move

/** Draw, pass or submit 1–2 random cards (matching the top set's size when there is one). */
export const randomMovePolicy: MovePolicy = (view, rng) => {
  const game = view.game
  const roll = rng.next()
  if (!game || roll < 0.25) {
    return { type: 'pass' }
  }
  if (roll < 0.45) {
    return { type: 'draw' }
  }
  const top = game.field[game.field.length - 1]
  const k = top ? top.length : 1 + randomInt(rng, 2)
  const hand = [...game.hand]
  const submit: CardId[] = []
  while (submit.length < k && hand.length > 0) {
    submit.push(hand.splice(randomInt(rng, hand.length), 1)[0])
  }
  return { type: 'submit', submit, factor: [] }
}

export type FuzzOptions<S> = {
  seed: number
  steps: number
  engine: GameEngine
  policy?: MovePolicy
  model?: ClientModel<S>
  config?: Partial<RoomConfig>
}

export type FuzzStats = Record<string, number>

/** Short durations so grace, caps and GC all happen within a run. */
export const FUZZ_CONFIG: Partial<RoomConfig> = {
  gracePlayingMs: 30_000,
  graceIdleMs: 15_000,
  awayTurnCapMs: 5_000,
  roomTtlIdleMs: 120_000,
  roomTtlActiveMs: 240_000,
}

const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi']

export function runFuzz<S = MinimalClientState>(opts: FuzzOptions<S>): FuzzStats {
  const w = new SimWorld<S>({
    seed: opts.seed,
    engine: opts.engine,
    model: opts.model,
    config: { ...FUZZ_CONFIG, ...opts.config },
  })
  const rng = mulberry32((opts.seed * 2654435761) >>> 0)
  const policy = opts.policy ?? randomMovePolicy
  const stats: FuzzStats = {}
  const bump = (k: string) => {
    stats[k] = (stats[k] ?? 0) + 1
  }
  const pick = <T>(xs: T[]): T | undefined =>
    xs.length === 0 ? undefined : xs[randomInt(rng, xs.length)]
  const active = () => w.clients.filter((c) => c.terminal === null)
  const readyClients = () => w.clients.filter((c) => c.ready)

  const initial = 2 + randomInt(rng, 3)
  for (let i = 0; i < initial; i += 1) {
    w.addClient(NAMES[i])
  }
  w.settle()

  type Action = [number, () => void]
  const actions: Action[] = [
    [
      30,
      () => {
        const pid = w.currentPid()
        const c = pid ? readyClients().find((x) => x.pid === pid) : pick(readyClients())
        if (!c?.view) {
          return
        }
        const roll = rng.next()
        if (roll < 0.08) {
          // a move from someone else, or for a stale turn
          const other = pick(readyClients())
          if (other) {
            w.move(other, { type: 'pass' }, (other.view?.game?.turn ?? 0) - (roll < 0.04 ? 1 : 0))
          }
          bump('bad-move')
          return
        }
        w.move(c, policy(c.view, rng))
        bump('move')
      },
    ],
    [
      10,
      () => {
        const c = pick(readyClients())
        c?.send({ type: rng.next() < 0.75 ? 'ready' : 'unready' })
      },
    ],
    [
      8,
      () => {
        const c = pick(readyClients())
        if (c?.view) {
          c.send({ type: 'start', expectedVersion: c.view.version - (rng.next() < 0.1 ? 1 : 0) })
          bump('start')
        }
      },
    ],
    [
      3,
      () => {
        const c = pick(readyClients())
        if (!c) {
          return
        }
        if (rng.next() < 0.15) {
          c.send({ type: 'set-rule', rule: { timeLimit: 16 } })
          return
        }
        c.send({
          type: 'set-rule',
          rule: {
            timeLimit: pick([...ALLOWED_RULES.timeLimit]) as number,
            initNumCards: pick([...ALLOWED_RULES.initNumCards]) as number,
            maxSubmitNumCards: pick([...ALLOWED_RULES.maxSubmitNumCards]) as number,
            halfEvenNumbers: rng.next() < 0.3,
          },
        })
      },
    ],
    [
      2,
      () => {
        const c = pick(readyClients())
        if (c) {
          c.send({ type: 'leave' })
          bump('leave')
        }
      },
    ],
    [
      3,
      () => {
        if (active().length < 6) {
          const used = new Set(w.clients.map((c) => c.name))
          const name = NAMES.find((n) => !used.has(n))
          if (name) {
            w.addClient(name)
            bump('join')
          } else {
            // someone who left comes back with the same identity
            const gone = pick(w.clients.filter((c) => c.terminal === 'left'))
            if (gone) {
              w.addClient(gone.name, { pid: gone.pid })
              bump('rejoin')
            }
          }
        }
      },
    ],
    [3, () => pick(active())?.reload()],
    [
      3,
      () => {
        const c = pick(active().filter((x) => x.online))
        if (c) {
          c.goOffline('reset')
          w.clock.after(500 + randomInt(rng, 10_000), () => c.goOnline())
          bump('blip')
        }
      },
    ],
    [
      3,
      () => {
        const c = pick(active().filter((x) => x.online))
        if (c) {
          c.goOffline('half-open')
          w.clock.after(1000 + randomInt(rng, 90_000), () => c.goOnline())
          bump('half-open')
        }
      },
    ],
    [
      3,
      () => {
        const c = pick(active().filter((x) => x.awake))
        if (c) {
          c.sleep({ closeSocket: rng.next() < 0.5 })
          w.clock.after(5000 + randomInt(rng, 150_000), () => c.wake())
          bump('sleep')
        }
      },
    ],
    [
      1,
      () => {
        const c = pick(readyClients())
        if (c) {
          w.secondTab(c)
          bump('second-tab')
        }
      },
    ],
    [
      2,
      () => {
        const c = pick(w.clients.filter((x) => x.terminal === 'superseded'))
        if (c) {
          // the tab we take over from must not be the only one left alive for this pid later
          c.resume()
          bump('resume')
        }
      },
    ],
    [1, () => pick(readyClients())?.duplicateHello()],
    [
      1,
      () => {
        w.host.crashRestart()
        bump('crash-restart')
      },
    ],
    [
      1,
      () => {
        const r = w.host.hibernateWake()
        if (r && r.events.length > 0) {
          throw new Error('hibernation wake changed the room')
        }
      },
    ],
  ]
  const total = actions.reduce((n, [weight]) => n + weight, 0)

  for (let step = 0; step < opts.steps; step += 1) {
    let roll = rng.next() * total
    for (const [weight, act] of actions) {
      roll -= weight
      if (roll < 0) {
        act()
        break
      }
    }
    const t = rng.next()
    w.run(
      t < 0.7
        ? 50 + randomInt(rng, 3000)
        : t < 0.95
          ? 3000 + randomInt(rng, 30_000)
          : 30_000 + randomInt(rng, 200_000),
    )
    stats.caughtUp = (stats.caughtUp ?? 0) + w.checkCaughtUp()
  }

  // liveness: whatever happened, once everyone is gone the game ends and the room is collected
  for (const c of w.clients) {
    c.closeTab()
  }
  const cfg = w.config
  // a half-open socket is only noticed by the sweep (every 60 s, after 75 s of silence)
  w.run(SWEEP_INTERVAL_MS + SWEEP_STALE_MS + cfg.gracePlayingMs + cfg.awayTurnCapMs + 5_000)
  if (w.host.state !== null && w.host.state.status === 'playing') {
    throw new Error('liveness: the game is still running after every player went away')
  }
  w.run(cfg.roomTtlActiveMs + 5_000)
  if (w.host.state !== null) {
    const st = w.host.state
    throw new Error(
      `liveness: the abandoned room was not garbage-collected (now=${w.clock.now} gcAt=${st.gcAt} ` +
        `alarm=${w.clock.alarmAt} conns=${w.host.conns.size} members=${JSON.stringify(st.members)})`,
    )
  }

  for (const e of w.timeline) {
    bump(`evt:${e.type}${e.type === 'passed' ? `:${e.reason}` : ''}`)
  }
  for (const c of w.clients as SimClient<S>[]) {
    for (const f of c.frames) {
      if (f.t === 'welcome') {
        bump(`welcome:${f.mode}`)
      }
    }
  }
  stats.duplicateAlarms = w.clock.duplicateAlarms
  stats.gc = w.host.destroyedCount
  return stats
}
