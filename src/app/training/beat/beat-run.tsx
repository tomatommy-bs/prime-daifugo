'use client'

import { NumberGlyph } from '@/design/NumberGlyph'
import type { CardId } from '@/game-card/src'
import type { Rng } from '@/shared/rng'
import { type BeatQuestion, type BeatVerdict, beatQuestion, judgeBeat } from '@/training/beat-field'
import { concat, primePowers } from '@/training/cards'
import type { Level } from '@/training/levels'
import { ActionIcon, Button, Kbd } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconBackspace, IconFlag } from '@tabler/icons-react'
import { useState } from 'react'
import { CardRow, HandPicker, RankChips, Tray, TrayCard, fromCard } from '../_ui/cards'
import { Feedback, PowerProduct } from '../_ui/feedback'
import { type QuestionProps, TrainingRun } from '../_ui/training-run'

const FIELD_CARD = 'clamp(56px, 13dvh, 96px)'
/** Answers listed after a question; the rest are summarised. */
const SHOWN_SOLUTIONS = 8

const makeQuestion = (rng: Rng, level: Level) => beatQuestion(rng, level)

type Outcome = { kind: 'answer'; cards: CardId[]; verdict: BeatVerdict } | { kind: 'give-up' }

function reasonText(verdict: Extract<BeatVerdict, { ok: false }>, q: BeatQuestion) {
  switch (verdict.reason) {
    case 'count':
      return `場と同じ ${q.k} 枚で出してください。`
    case 'too-small':
      return `${verdict.value} は場の ${q.fieldValue} 以下です。`
    default: {
      const powers = primePowers(verdict.value)
      return (
        <>
          <span className="num font-bold">
            {verdict.value} = <PowerProduct powers={powers} />
          </span>{' '}
          は素数ではありません。
        </>
      )
    }
  }
}

function BeatQuestionView({ question: q, answered, onAnswer }: QuestionProps<BeatQuestion>) {
  const [tray, setTray] = useState<CardId[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const used = new Set(tray)
  const full = tray.length === q.k

  const toggle = (card: CardId) =>
    setTray((prev) =>
      prev.includes(card)
        ? prev.filter((c) => c !== card)
        : prev.length < q.k
          ? [...prev, card]
          : prev,
    )
  const submit = () => {
    if (answered || !full) {
      return
    }
    const verdict = judgeBeat(q, tray)
    setOutcome({ kind: 'answer', cards: tray, verdict })
    onAnswer(verdict.ok)
  }
  const giveUp = () => {
    if (answered) {
      return
    }
    setOutcome({ kind: 'give-up' })
    onAnswer(false)
  }
  useHotkeys(
    answered
      ? []
      : [
          ['Enter', (e) => !fromCard(e) && submit()],
          ['Backspace', () => setTray((prev) => prev.slice(0, -1))],
          ['Escape', () => setTray([])],
        ],
  )

  const answerValue = outcome?.kind === 'answer' ? outcome.verdict.value : null

  return (
    <section
      aria-label="問題"
      className="flex flex-col gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:p-fib-3"
    >
      <div className="flex flex-wrap items-center gap-fib-3" data-field="">
        <span className="text-[length:var(--fs--1)] font-bold text-ink-muted">場</span>
        <CardRow cards={q.field} height={FIELD_CARD} label={`場のカード ${q.fieldValue}`} />
        <NumberGlyph value={q.fieldValue} size={4} srLabel={`場は ${q.fieldValue}`} />
        <p className="m-0 basis-full text-ink-muted [text-wrap:pretty] sm:ml-auto sm:basis-auto">
          手札の <span className="num font-bold text-ink">{q.k}</span> 枚で、
          <span className="num font-bold text-ink">{q.fieldValue}</span> より大きな素数を出そう
        </p>
      </div>

      <Tray
        label="出すカード"
        active={!answered}
        empty={tray.length === 0}
        readout={
          tray.length > 0 ? (
            <span className="num font-bold" data-tray-value="">
              {concat(tray)}
              <span className="font-normal text-ink-muted">
                {' '}
                ({tray.length}/{q.k})
              </span>
            </span>
          ) : null
        }
      >
        {tray.map((card) => (
          <TrayCard key={card} card={card} disabled={answered} onRemove={() => toggle(card)} />
        ))}
      </Tray>

      <HandPicker cards={q.hand} used={used} disabled={answered} onToggle={toggle} />

      {answered ? null : (
        <div className="flex flex-wrap items-center gap-fib-2">
          <Button
            variant="subtle"
            color="ink"
            onClick={giveUp}
            leftSection={<IconFlag stroke={1.5} size="1.1em" />}
          >
            わからない
          </Button>
          <ActionIcon
            onClick={() => setTray((prev) => prev.slice(0, -1))}
            aria-label="1枚戻す"
            aria-keyshortcuts="Backspace"
            disabled={tray.length === 0}
            color="ink"
            className="ml-auto"
          >
            <IconBackspace stroke={1.5} size="1.25em" />
          </ActionIcon>
          <Button
            size="md"
            disabled={!full}
            onClick={submit}
            aria-keyshortcuts="Enter"
            rightSection={
              <Kbd size="xs" className="hidden fine:inline-block">
                Enter
              </Kbd>
            }
          >
            出す
          </Button>
        </div>
      )}

      {answered && outcome !== null ? (
        <Feedback
          correct={outcome.kind === 'answer' && outcome.verdict.ok}
          title={outcome.kind === 'give-up' ? '答え' : undefined}
        >
          {outcome.kind === 'answer' && !outcome.verdict.ok ? (
            <p className="m-0">{reasonText(outcome.verdict, q)}</p>
          ) : null}
          {outcome.kind === 'answer' &&
          outcome.verdict.ok &&
          outcome.verdict.value !== q.solutions[0].value ? (
            <p className="m-0 text-ink-muted">
              最大は <span className="num font-bold text-ink">{q.solutions[0].value}</span> でした。
            </p>
          ) : null}
          <Solutions q={q} highlight={answerValue} />
        </Feedback>
      ) : null}
    </section>
  )
}

function Solutions({ q, highlight }: { q: BeatQuestion; highlight: number | null }) {
  const shown = q.solutions.slice(0, SHOWN_SOLUTIONS)
  const rest = q.solutions.length - shown.length
  return (
    <div className="flex flex-col gap-fib-1">
      <p className="m-0 text-[length:var(--fs--1)] text-ink-muted">
        出せた数（{q.solutions.length} 通り）
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-fib-2 p-0" aria-label="出せた数">
        {shown.map((s) => (
          <li
            key={s.value}
            data-solution={s.value}
            className={`flex items-center gap-fib-1 rounded-[var(--r-1)] border px-fib-1 py-1 ${s.value === highlight ? 'border-prime' : 'border-line'}`}
          >
            <RankChips cards={s.cards} />
            <span className="num font-bold">{s.value}</span>
            {s.value === 57 ? (
              <span className="text-[length:var(--fs--2)] text-gold">57 切り</span>
            ) : null}
          </li>
        ))}
        {rest > 0 ? (
          <li className="self-center text-[length:var(--fs--1)] text-ink-muted">
            ほか {rest} 通り
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export function BeatRun({ rng }: { rng?: Rng }) {
  return (
    <TrainingRun mode="beat" makeQuestion={makeQuestion} Question={BeatQuestionView} rng={rng} />
  )
}
