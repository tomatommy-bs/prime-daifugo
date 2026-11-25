/**
 * Rule changes written as axiom diffs (§7.4), replacing the old `JSON.stringify(rule)` log.
 *   ruleDiff({ timeLimit: 60, … }, { timeLimit: 15 }) → ['t: 60 → 15 s']
 */
import type { PrimeDaifugoSetupData } from '@/interface/common'

type Key = keyof PrimeDaifugoSetupData

/** `k_max` values at or above a full deck read as "no limit". */
const UNLIMITED_SUBMIT = 52

const FORMAT: { [K in Key]: { label: string; value: (v: PrimeDaifugoSetupData[K]) => string } } = {
  timeLimit: { label: 't', value: (v) => `${v}` },
  initNumCards: { label: '|H₀|', value: (v) => `${v}` },
  maxSubmitNumCards: { label: 'k_max', value: (v) => (v >= UNLIMITED_SUBMIT ? '∞' : `${v}`) },
  halfEvenNumbers: { label: '偶数半減', value: (v) => (v ? 'ON' : 'OFF') },
}

/** Display order, matching the waiting-room axioms. */
const ORDER: Key[] = ['timeLimit', 'initNumCards', 'maxSubmitNumCards', 'halfEvenNumbers']

function formatEntry<K extends Key>(
  key: K,
  from: PrimeDaifugoSetupData[K] | undefined,
  to: PrimeDaifugoSetupData[K],
): string {
  const f = FORMAT[key]
  const unit = key === 'timeLimit' ? ' s' : ''
  const before = from === undefined ? '—' : f.value(from)
  return `${f.label}: ${before} → ${f.value(to)}${unit}`
}

/**
 * One line per changed rule, e.g. `t: 60 → 15 s`, `|H₀|: 8 → 11`, `k_max: 4 → ∞`,
 * `偶数半減: OFF → ON`. Keys missing from `next`, or unchanged, are skipped.
 */
export function ruleDiff(
  prev: Partial<PrimeDaifugoSetupData> | null | undefined,
  next: Partial<PrimeDaifugoSetupData>,
): string[] {
  const lines: string[] = []
  for (const key of ORDER) {
    const to = next[key]
    if (to === undefined) {
      continue
    }
    const from = prev?.[key]
    if (from === to) {
      continue
    }
    lines.push(formatEntry(key, from as never, to as never))
  }
  return lines
}
