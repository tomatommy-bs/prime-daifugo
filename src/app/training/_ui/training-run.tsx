'use client'

import { NumberGlyph } from '@/design/NumberGlyph'
import { useMotionPreset } from '@/design/motion'
import { type Rng, cryptoRng } from '@/shared/rng'
import {
  LEVELS,
  LEVEL_LABEL,
  type Level,
  MODE_INFO,
  type Mode,
  QUESTIONS_PER_RUN,
  isLevel,
} from '@/training/levels'
import { type BestRecord, readBest, saveIfBest } from '@/training/records'
import { type RunResult, type RunState, formatMs, runReducer, scoreOf } from '@/training/session'
import { Button, Kbd, SegmentedControl } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconArrowRight, IconCheck, IconPlayerPlay, IconRefresh, IconX } from '@tabler/icons-react'
import { AnimatePresence, m } from 'framer-motion'
import Link from 'next/link'
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

/** What a mode's question component receives. Keyed by question index, so state resets. */
export type QuestionProps<Q> = {
  question: Q
  level: Level
  /** the answer is in: show the explanation and stop taking input */
  answered: boolean
  onAnswer: (correct: boolean) => void
}

export type TrainingRunProps<Q> = {
  mode: Mode
  /** a fresh question; `asked` are the questions of this run so far */
  makeQuestion: (rng: Rng, level: Level, asked: readonly Q[]) => Q
  Question: ComponentType<QuestionProps<Q>>
  /** an override for tests */
  rng?: Rng
  now?: () => number
}

const LEVEL_KEY = 'pd_training_level'

const readLevel = (mode: Mode): Level => {
  try {
    const v = window.localStorage.getItem(`${LEVEL_KEY}:${mode}`)
    return isLevel(v) ? v : 'easy'
  } catch {
    return 'easy'
  }
}

const writeLevel = (mode: Mode, level: Level) => {
  try {
    window.localStorage.setItem(`${LEVEL_KEY}:${mode}`, level)
  } catch {
    // storage blocked: the level just is not remembered
  }
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * The 10-question time attack around one mode: the start screen (level, best record), the
 * progress bar and clock, the next button, and the result screen.
 */
export function TrainingRun<Q>({
  mode,
  makeQuestion,
  Question,
  rng: rngProp,
  now = defaultNow,
}: TrainingRunProps<Q>) {
  const [level, setLevel] = useState<Level>('easy')
  const [state, dispatch] = useReducer(runReducer<Q>, { phase: 'ready' } as RunState<Q>)
  const rngRef = useRef<Rng | null>(rngProp ?? null)
  const asked = useRef<Q[]>([])

  useEffect(() => {
    setLevel(readLevel(mode))
  }, [mode])

  const rng = () => {
    rngRef.current ??= cryptoRng()
    return rngRef.current
  }

  const next = (): Q => {
    const q = makeQuestion(rng(), level, asked.current)
    asked.current.push(q)
    return q
  }

  const start = () => {
    asked.current = []
    writeLevel(mode, level)
    dispatch({ type: 'start', question: next(), now: now() })
  }

  const advance = () => {
    if (state.phase !== 'feedback') {
      return
    }
    const last = state.index + 1 >= QUESTIONS_PER_RUN
    dispatch({ type: 'next', question: last ? null : next(), now: now() })
  }

  const chooseLevel = (value: Level) => {
    setLevel(value)
    writeLevel(mode, value)
  }

  switch (state.phase) {
    case 'ready':
      return <StartScreen mode={mode} level={level} onLevel={chooseLevel} onStart={start} />
    case 'done':
      return (
        <ResultScreen
          mode={mode}
          level={level}
          results={state.results}
          onRetry={start}
          onChangeLevel={() => dispatch({ type: 'reset' })}
        />
      )
    default:
      return (
        <div className="mx-auto flex w-full max-w-[987px] flex-col gap-fib-3">
          <ProgressBar
            index={state.index}
            results={state.results}
            openedAt={state.phase === 'question' ? state.openedAt : null}
            now={now}
          />
          <Question
            key={state.index}
            question={state.question}
            level={level}
            answered={state.phase === 'feedback'}
            onAnswer={(correct) => dispatch({ type: 'answer', correct, now: now() })}
          />
          {state.phase === 'feedback' ? (
            <NextButton last={state.index + 1 >= QUESTIONS_PER_RUN} onNext={advance} />
          ) : null}
        </div>
      )
  }
}

/* ------------------------------------------------------------------ */

function StartScreen({
  mode,
  level,
  onLevel,
  onStart,
}: {
  mode: Mode
  level: Level
  onLevel: (level: Level) => void
  onStart: () => void
}) {
  const info = MODE_INFO[mode]
  const [best, setBest] = useState<BestRecord | null>(null)
  useEffect(() => setBest(readBest(mode, level)), [mode, level])
  useHotkeys([['Enter', onStart]])

  return (
    <section
      aria-label="スタート"
      className="mx-auto flex w-full max-w-[610px] flex-col gap-fib-4 self-start rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:p-fib-3"
    >
      <p className="m-0 text-ink-muted [text-wrap:pretty]">{info.summary}</p>
      <div className="flex flex-col gap-fib-2">
        <span id="level-label" className="font-bold text-[length:var(--fs--1)]">
          難易度
        </span>
        <SegmentedControl
          aria-labelledby="level-label"
          fullWidth={true}
          value={level}
          onChange={(v) => isLevel(v) && onLevel(v)}
          data={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
        />
        <p className="m-0 text-[length:var(--fs--1)] text-ink-muted" data-level-detail="">
          {info.levels[level]}・全 {QUESTIONS_PER_RUN} 問
        </p>
      </div>
      <dl className="m-0 flex items-baseline gap-fib-3 border-t border-line pt-fib-3">
        <dt className="text-[length:var(--fs--1)] text-ink-muted">ベスト</dt>
        <dd className="m-0 num" data-best="">
          {best ? (
            <>
              {best.correct} / {best.total} 問正解・{formatMs(best.ms)} 秒
            </>
          ) : (
            <span className="text-ink-muted">記録なし</span>
          )}
        </dd>
      </dl>
      <Button
        size="md"
        h={55}
        onClick={onStart}
        leftSection={<IconPlayerPlay stroke={1.5} size="1.25em" />}
        rightSection={
          <Kbd size="xs" className="hidden fine:inline-block">
            Enter
          </Kbd>
        }
        styles={{ label: { fontSize: 'var(--fs-1)', fontWeight: 700 } }}
      >
        スタート
      </Button>
    </section>
  )
}

/** Live clock: past answers plus the open question. */
function ProgressBar({
  index,
  results,
  openedAt,
  now,
}: {
  index: number
  results: RunResult[]
  openedAt: number | null
  now: () => number
}) {
  const base = scoreOf(results)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (openedAt === null) {
      return
    }
    const id = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [openedAt])
  void tick
  const ms = base.ms + (openedAt === null ? 0 : Math.max(0, now() - openedAt))

  return (
    <div className="flex flex-col gap-fib-2" data-progress="">
      <div className="flex items-baseline gap-fib-3">
        <span className="num font-bold">
          Q{index + 1}
          <span className="text-ink-muted"> / {QUESTIONS_PER_RUN}</span>
        </span>
        <span
          className="num text-[length:var(--fs--1)] text-ink-muted"
          aria-label={`正解 ${base.correct} 問`}
        >
          <IconCheck stroke={2} size="1em" className="inline align-[-0.1em] text-prime" />{' '}
          {base.correct}
        </span>
        <span className="num ml-auto tabular-nums" aria-label="経過時間" role="timer">
          {formatMs(ms)} 秒
        </span>
      </div>
      <ol
        className="m-0 grid list-none gap-1 p-0"
        style={{ gridTemplateColumns: `repeat(${QUESTIONS_PER_RUN}, 1fr)` }}
        aria-hidden="true"
      >
        {Array.from({ length: QUESTIONS_PER_RUN }, (_, i) => {
          const r = results[i]
          const color = r
            ? r.correct
              ? 'bg-prime'
              : 'bg-danger/60'
            : i === index
              ? 'bg-ink'
              : 'bg-line'
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional slots
          return <li key={i} className={`h-1 rounded-full ${color}`} />
        })}
      </ol>
    </div>
  )
}

function NextButton({ last, onNext }: { last: boolean; onNext: () => void }) {
  useHotkeys([['Enter', onNext]])
  return (
    <Button
      size="md"
      onClick={onNext}
      className="self-end"
      rightSection={
        <span className="inline-flex items-center gap-fib-1">
          <IconArrowRight stroke={1.5} size="1.25em" />
          <Kbd size="xs" className="hidden fine:inline-block">
            Enter
          </Kbd>
        </span>
      }
      data-autofocus={true}
    >
      {last ? '結果を見る' : '次の問題'}
    </Button>
  )
}

function ResultScreen({
  mode,
  level,
  results,
  onRetry,
  onChangeLevel,
}: {
  mode: Mode
  level: Level
  results: RunResult[]
  onRetry: () => void
  onChangeLevel: () => void
}) {
  const score = useMemo(() => scoreOf(results), [results])
  const preset = useMotionPreset()
  // save once per finished run (StrictMode re-runs effects, the ref keeps it single)
  const saved = useRef<boolean | null>(null)
  const [newBest, setNewBest] = useState(false)
  useEffect(() => {
    if (saved.current === null) {
      saved.current = saveIfBest(mode, level, score, new Date())
    }
    setNewBest(saved.current)
  }, [mode, level, score])
  useHotkeys([['Enter', onRetry]])

  return (
    <section
      aria-label="結果"
      className="mx-auto flex w-full max-w-[610px] flex-col gap-fib-4 self-start rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:p-fib-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-fib-3 gap-y-fib-1">
        <span className="text-ink-muted">{LEVEL_LABEL[level]}</span>
        <AnimatePresence>
          {newBest ? (
            <m.span
              variants={preset.pop}
              initial="hidden"
              animate="show"
              className="rounded-[var(--r-1)] bg-gold/15 px-fib-2 font-bold text-gold"
              data-new-best=""
            >
              ベスト更新
            </m.span>
          ) : null}
        </AnimatePresence>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-fib-3">
        <Stat label="正解">
          <NumberGlyph
            value={score.correct}
            size={5}
            tone="prime"
            srLabel={`${score.correct} 問正解`}
          />
          <span className="num text-ink-muted"> / {score.total}</span>
        </Stat>
        <Stat label="タイム">
          <span className="num font-bold text-[length:var(--fs-4)]" data-result-time="">
            {formatMs(score.ms)}
          </span>
          <span className="text-ink-muted"> 秒</span>
        </Stat>
      </dl>
      <ol className="m-0 grid list-none grid-cols-5 gap-fib-1 p-0 text-[length:var(--fs--1)]">
        {results.map((r, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: positional question numbers
            key={i}
            className="flex items-center gap-1 rounded-[var(--r-1)] border border-line px-fib-1 py-1"
            aria-label={`${i + 1} 問目 ${r.correct ? '正解' : '不正解'} ${formatMs(r.ms)} 秒`}
          >
            {r.correct ? (
              <IconCheck stroke={2} size="1em" className="shrink-0 text-prime" aria-hidden="true" />
            ) : (
              <IconX stroke={2} size="1em" className="shrink-0 text-danger" aria-hidden="true" />
            )}
            <span className="num text-ink-muted" aria-hidden="true">
              {formatMs(r.ms)}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-fib-2">
        <Button
          onClick={onRetry}
          leftSection={<IconRefresh stroke={1.5} size="1.25em" />}
          rightSection={
            <Kbd size="xs" className="hidden fine:inline-block">
              Enter
            </Kbd>
          }
        >
          もう一度
        </Button>
        <Button variant="default" onClick={onChangeLevel}>
          難易度を変える
        </Button>
        <Button variant="subtle" component={Link} href="/training" className="ml-auto">
          ほかのトレーニング
        </Button>
      </div>
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-fib-1">
      <dt className="text-[length:var(--fs--1)] font-semibold text-ink-muted">{label}</dt>
      <dd className="m-0 flex items-baseline">{children}</dd>
    </div>
  )
}
