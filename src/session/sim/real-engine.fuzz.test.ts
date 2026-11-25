/**
 * Session fuzz with the real rules engine and the real client reducer (spec §12.1, integration):
 * 100 seeds × 300 steps by default (`SIM_RUNS`, `SIM_STEPS`, `SIM_SEED` as in `fuzz.test.ts`).
 *
 * On top of every simulator invariant, each caught-up client's UI bundle (the real
 * `clientReduce` state, as `useRoomSession` exposes it) must equal
 * `viewToBundle(viewFor(server, pid), pid)`.
 *
 * The move policy plays legal primes when it can (so games really end on an empty hand), and
 * otherwise mixes in not-prime submits, factor attempts, draws and passes.
 */
import { describe, expect, it } from 'vitest'
import { viewToBundle } from '../../app/room/[id]/session/adapter'
import {
  type ClientState,
  clientReduce,
  initialClientState,
} from '../../app/room/[id]/session/client-reducer'
import { engine } from '../../game/engine'
import { concatValue, isPrime } from '../../game/numbers'
import type { CardId, FactCardId } from '../../game/types'
import { randomInt } from '../../shared/rng'
import { type FuzzStats, type MovePolicy, runFuzz } from './fuzz'
import type { ClientModel } from './sim-client'

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const RUNS = Number(env.SIM_RUNS ?? 100)
const STEPS = Number(env.SIM_STEPS ?? 300)
const FIXED_SEED = env.SIM_SEED !== undefined ? Number(env.SIM_SEED) : null

/** The real client reducer behind the simulator's `ClientModel` seam. */
const realClientModel: ClientModel<ClientState> = {
  init: () => initialClientState(),
  apply: (state, frame) => clientReduce(state, frame).state,
  lastSeq: (state) => state.lastSeq,
  epoch: (state) => state.epoch,
  view: (state) => state.view,
  checkCaughtUp(state, expected, pid) {
    const want = JSON.stringify(viewToBundle(expected, pid))
    const got = JSON.stringify(state.game)
    if (want !== got) {
      throw new Error(`client ${pid} bundle diverged:\n  client ${got}\n  server ${want}`)
    }
    if (state.selfId !== pid) {
      throw new Error(`client ${pid} has selfId ${state.selfId}`)
    }
  },
}

/** Subsets of `hand` of size `k` (k ≤ 2), in a seeded random order. */
function candidates(hand: CardId[], k: number): CardId[][] {
  const out: CardId[][] = []
  if (k === 1) {
    for (const a of hand) {
      out.push([a])
    }
  } else if (k === 2) {
    for (const a of hand) {
      for (const b of hand) {
        if (a !== b) {
          out.push([a, b])
        }
      }
    }
  }
  return out
}

const primePolicy: MovePolicy = (view, rng) => {
  const game = view.game
  if (!game) {
    return { type: 'pass' }
  }
  const hand = [...game.hand]
  const top = game.field[game.field.length - 1]
  const k = top ? top.length : 1 + randomInt(rng, 2)
  const roll = rng.next()
  if (roll < 0.12) {
    return { type: 'pass' }
  }
  if (roll < 0.25) {
    return { type: 'draw' }
  }
  if (roll < 0.35 && hand.length >= 2) {
    // a factor attempt: a two-card number "factored" as card × card (usually a penalty)
    const [a, b, c, d] = [...hand].sort(() => rng.next() - 0.5)
    const factor: FactCardId[] = c && d && c !== a && d !== b ? [c, '*', d] : [a, '*', b]
    return { type: 'submit', submit: [a, b].slice(0, k), factor }
  }
  if (roll < 0.85 && k <= 2) {
    const floor = top ? concatValue(top) : BigInt(0)
    const legal = candidates(hand, k).filter((set) => {
      const n = concatValue(set)
      return n > floor && isPrime(n)
    })
    if (legal.length > 0) {
      return { type: 'submit', submit: legal[randomInt(rng, legal.length)], factor: [] }
    }
  }
  // anything: often not prime (penalty) or not matching the field (rejected)
  const submit: CardId[] = []
  while (submit.length < k && hand.length > 0) {
    submit.push(hand.splice(randomInt(rng, hand.length), 1)[0])
  }
  return { type: 'submit', submit, factor: [] }
}

describe('session fuzz (real engine, real client reducer)', () => {
  it(FIXED_SEED !== null
    ? `replays SIM_SEED=${FIXED_SEED}`
    : `${RUNS} seeds × ${STEPS} steps hold every invariant`, () => {
    const seeds = FIXED_SEED !== null ? [FIXED_SEED] : Array.from({ length: RUNS }, (_, i) => i + 1)
    const totals: FuzzStats = {}
    for (const seed of seeds) {
      let stats: FuzzStats
      try {
        stats = runFuzz({ seed, steps: STEPS, engine, policy: primePolicy, model: realClientModel })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // biome-ignore lint/suspicious/noConsole: the seed is the reproduction recipe
        console.error(`real-engine fuzz failed: SIM_SEED=${seed} (SIM_STEPS=${STEPS})\n${message}`)
        throw new Error(`SIM_SEED=${seed}: ${message}`)
      }
      for (const [k, v] of Object.entries(stats)) {
        totals[k] = (totals[k] ?? 0) + v
      }
    }
    if (FIXED_SEED === null && RUNS >= 50) {
      for (const key of [
        'evt:game-started',
        'evt:game-ended',
        'evt:forfeited',
        'evt:passed:timeout',
        'evt:passed:manual',
        'evt:submitted',
        'evt:drew',
        'welcome:replay',
        'welcome:snapshot',
        'crash-restart',
        'gc',
        'caughtUp',
      ]) {
        expect(totals[key] ?? 0, key).toBeGreaterThan(0)
      }
    }
  }, 600_000)
})
