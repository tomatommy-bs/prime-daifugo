/**
 * Session fuzz (spec §12.1): 200 seeds × 300 steps by default.
 * - `SIM_RUNS=N` runs N seeds, `SIM_STEPS=N` changes the steps per seed;
 * - a failure prints `SIM_SEED=<seed>`; setting `SIM_SEED` replays exactly that seed.
 * The engine is injected; integration adds a real-engine run (`real-engine.fuzz.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import type { GameEngine } from '../../game/types'
import { fakeEngine } from '../testing/fake-engine'
import { type FuzzStats, runFuzz } from './fuzz'
import { SimWorld, TURN_LIVENESS_SLACK_MS } from './world'

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const RUNS = Number(env.SIM_RUNS ?? 200)
const STEPS = Number(env.SIM_STEPS ?? 300)
const FIXED_SEED = env.SIM_SEED !== undefined ? Number(env.SIM_SEED) : null

const KITS: { name: string; engine: GameEngine }[] = [{ name: 'fake engine', engine: fakeEngine }]

describe.each(KITS)('session fuzz ($name)', ({ engine }) => {
  it(FIXED_SEED !== null
    ? `replays SIM_SEED=${FIXED_SEED}`
    : `${RUNS} seeds × ${STEPS} steps hold every invariant`, () => {
    const seeds = FIXED_SEED !== null ? [FIXED_SEED] : Array.from({ length: RUNS }, (_, i) => i + 1)
    const totals: FuzzStats = {}
    for (const seed of seeds) {
      let stats: FuzzStats
      try {
        stats = runFuzz({ seed, steps: STEPS, engine })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // biome-ignore lint/suspicious/noConsole: the seed is the reproduction recipe
        console.error(`session fuzz failed: SIM_SEED=${seed} (SIM_STEPS=${STEPS})\n${message}`)
        throw new Error(`SIM_SEED=${seed}: ${message}`)
      }
      for (const [k, v] of Object.entries(stats)) {
        totals[k] = (totals[k] ?? 0) + v
      }
    }
    if (FIXED_SEED === null && RUNS >= 50) {
      // the fuzz must actually reach the interesting paths
      for (const key of [
        'evt:game-started',
        'evt:game-ended',
        'evt:forfeited',
        'evt:member-left',
        'evt:passed:timeout',
        'evt:passed:manual',
        'evt:submitted',
        'evt:drew',
        'welcome:replay',
        'welcome:snapshot',
        'crash-restart',
        'duplicateAlarms',
        'gc',
        'caughtUp',
        'turnLivenessChecked',
      ]) {
        expect(totals[key] ?? 0, key).toBeGreaterThan(0)
      }
    }
  }, 600_000)
})

describe('turn liveness invariant', () => {
  it('fails when a running turn outlives its deadline', () => {
    const w = new SimWorld({ seed: 1, engine: fakeEngine, duplicateAlarmProb: 0 })
    w.startGame(['alice', 'bob'])
    const deadline = w.state.game?.deadline as number
    expect(deadline).toBeGreaterThan(w.clock.now)
    // time is past the deadline and nothing moved the turn on
    w.clock.now = deadline + TURN_LIVENESS_SLACK_MS + 1
    expect(() => w.checkInvariants()).toThrow(/liveness: turn \d+ is still running/)
  })

  it('fails when a turn deadline is further away than the time limit allows', () => {
    const w = new SimWorld({ seed: 1, engine: fakeEngine, duplicateAlarmProb: 0 })
    w.startGame(['alice', 'bob'])
    const limitMs = w.state.rule.timeLimit * 1000
    w.host.patchState((draft) => {
      if (draft.game) {
        draft.game.deadline = w.clock.now + limitMs + w.config.restartDeadlineFloorMs + 60_000
      }
    })
    expect(() => w.checkInvariants()).toThrow(/liveness: turn \d+ deadline is \d+ ms away/)
  })

  it('holds while the alarm fires: the turn moves on at its deadline', () => {
    const w = new SimWorld({ seed: 1, engine: fakeEngine, duplicateAlarmProb: 0 })
    w.startGame(['alice', 'bob'])
    const turn = w.state.game?.core.turn
    w.run((w.state.game?.deadline as number) - w.clock.now + TURN_LIVENESS_SLACK_MS + 1)
    expect(w.state.game?.core.turn).not.toBe(turn)
    expect(w.maxDeadlineLagMs).toBeLessThanOrEqual(TURN_LIVENESS_SLACK_MS)
  })
})
