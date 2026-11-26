/**
 * A 10-question time attack, as a pure reducer. The clock runs only while a question is open:
 * reading the feedback after an answer does not count.
 */
import { QUESTIONS_PER_RUN } from './levels'

export type RunResult = { correct: boolean; ms: number }

export type RunState<Q> =
  | { phase: 'ready' }
  | { phase: 'question'; index: number; question: Q; openedAt: number; results: RunResult[] }
  | {
      phase: 'feedback'
      index: number
      question: Q
      results: RunResult[]
    }
  | { phase: 'done'; results: RunResult[] }

export type RunAction<Q> =
  | { type: 'start'; question: Q; now: number }
  | { type: 'answer'; correct: boolean; now: number }
  | { type: 'next'; question: Q | null; now: number }
  | { type: 'reset' }

export function runReducer<Q>(state: RunState<Q>, action: RunAction<Q>): RunState<Q> {
  switch (action.type) {
    case 'start':
      return {
        phase: 'question',
        index: 0,
        question: action.question,
        openedAt: action.now,
        results: [],
      }
    case 'answer':
      if (state.phase !== 'question') {
        return state
      }
      return {
        phase: 'feedback',
        index: state.index,
        question: state.question,
        results: [
          ...state.results,
          { correct: action.correct, ms: Math.max(0, action.now - state.openedAt) },
        ],
      }
    case 'next':
      if (state.phase !== 'feedback') {
        return state
      }
      if (state.index + 1 >= QUESTIONS_PER_RUN || action.question === null) {
        return { phase: 'done', results: state.results }
      }
      return {
        phase: 'question',
        index: state.index + 1,
        question: action.question,
        openedAt: action.now,
        results: state.results,
      }
    case 'reset':
      return { phase: 'ready' }
    default:
      return state
  }
}

export type RunScore = { correct: number; total: number; ms: number }

export const scoreOf = (results: readonly RunResult[]): RunScore => ({
  correct: results.filter((r) => r.correct).length,
  total: results.length,
  ms: results.reduce((sum, r) => sum + r.ms, 0),
})

/** More correct answers win; on a tie, the faster run. */
export const isBetter = (a: RunScore, b: RunScore | null): boolean =>
  b === null || a.correct > b.correct || (a.correct === b.correct && a.ms < b.ms)

/** `83450` → `1:23.4`, `9050` → `9.0` (seconds, tenths). */
export function formatMs(ms: number): string {
  const tenths = Math.floor(ms / 100)
  const minutes = Math.floor(tenths / 600)
  const seconds = (tenths % 600) / 10
  return minutes > 0 ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}` : `${seconds.toFixed(1)}`
}
