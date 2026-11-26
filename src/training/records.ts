/**
 * Best time-attack records, per mode and level, in localStorage. Storage failures (private
 * mode, quota, malformed data) degrade to "no record" and never throw.
 */
import { z } from 'zod'
import type { Level, Mode } from './levels'
import { type RunScore, isBetter } from './session'

export const RECORDS_KEY = 'pd_training_best_v1'

const scoreSchema = z.object({
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  ms: z.number().min(0),
  at: z.string(),
})

const recordsSchema = z.record(scoreSchema)

export type BestRecord = RunScore & { at: string }

const keyOf = (mode: Mode, level: Level) => `${mode}:${level}`

function readAll(): Record<string, BestRecord> {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY)
    if (raw === null) {
      return {}
    }
    const parsed = recordsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export function readBest(mode: Mode, level: Level): BestRecord | null {
  return readAll()[keyOf(mode, level)] ?? null
}

/** Store `score` when it beats the current best. Returns whether it is a new best. */
export function saveIfBest(mode: Mode, level: Level, score: RunScore, at: Date): boolean {
  if (score.total === 0) {
    return false
  }
  const all = readAll()
  const key = keyOf(mode, level)
  if (!isBetter(score, all[key] ?? null)) {
    return false
  }
  all[key] = { ...score, at: at.toISOString() }
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the run still counts as a best for this screen
  }
  return true
}
