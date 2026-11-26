'use client'

import { NumberGlyph } from '@/design/NumberGlyph'
import { type CardId, MathCard } from '@/game-card/src'
import type { Rng } from '@/shared/rng'
import type { Level } from '@/training/levels'
import {
  type PrimeAnswer,
  type PrimeQuestion,
  explainComposite,
  isCorrectPrimeAnswer,
  primeQuestion,
} from '@/training/prime-quiz'
import { Button, Kbd } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { useState } from 'react'
import { Feedback, PowerProduct } from '../_ui/feedback'
import { type QuestionProps, TrainingRun } from '../_ui/training-run'

const QUESTION_CARD = 'clamp(72px, 20dvh, 132px)'

const makeQuestion = (rng: Rng, level: Level, asked: readonly PrimeQuestion[]) =>
  primeQuestion(rng, level, new Set(asked.map((q) => q.value)))

/** Why a composite is easy to spot, when one of the classic tests applies. */
function hint(value: number): string | null {
  const digits = String(value).split('').map(Number)
  const sum = digits.reduce((a, b) => a + b, 0)
  if (value === 57) {
    return '57 は 3 × 19 の合成数ですが、グロタンディーク素数として場に出せます。'
  }
  if (value % 2 === 0) {
    return '一の位が偶数なので 2 で割り切れます。'
  }
  if (value % 5 === 0) {
    return '一の位が 5 なので 5 で割り切れます。'
  }
  if (sum % 3 === 0) {
    return `各桁の和 ${digits.join(' + ')} = ${sum} が 3 の倍数なので、3 で割り切れます。`
  }
  return null
}

function PrimeQuestionView({ question, answered, onAnswer }: QuestionProps<PrimeQuestion>) {
  const [answer, setAnswer] = useState<PrimeAnswer | null>(null)
  const choose = (a: PrimeAnswer) => {
    if (answered) {
      return
    }
    setAnswer(a)
    onAnswer(isCorrectPrimeAnswer(question, a))
  }
  useHotkeys(
    answered
      ? []
      : [
          ['ArrowLeft', () => choose('prime')],
          ['ArrowRight', () => choose('composite')],
          ['p', () => choose('prime')],
          ['c', () => choose('composite')],
        ],
  )

  const correct = answer !== null && isCorrectPrimeAnswer(question, answer)
  const powers = explainComposite(question)
  const why = question.prime ? null : hint(question.value)

  return (
    <section
      aria-label="問題"
      className="flex flex-col gap-fib-4 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:gap-fib-3 compact:p-fib-3"
    >
      <p className="m-0 text-center text-ink-muted">この数は素数？</p>
      <div className="flex flex-wrap items-center justify-center gap-fib-4">
        <div className="flex gap-fib-2">
          {question.cards.map((card: CardId) => (
            <MathCard
              key={card}
              card={card}
              size={QUESTION_CARD}
              layoutId={`q-${card}`}
              showValue={true}
            />
          ))}
        </div>
        <NumberGlyph value={question.value} size={5} srLabel={`n = ${question.value}`} />
      </div>
      <div className="grid grid-cols-2 gap-fib-3">
        <Button
          size="lg"
          h={64}
          color="prime"
          variant={answer === 'prime' ? 'filled' : answered ? 'default' : 'filled'}
          disabled={answered && answer !== 'prime'}
          onClick={() => choose('prime')}
          aria-keyshortcuts="ArrowLeft p"
          rightSection={
            <Kbd size="xs" className="hidden fine:inline-block">
              ←
            </Kbd>
          }
          styles={{ label: { fontSize: 'var(--fs-1)', fontWeight: 700 } }}
        >
          素数
        </Button>
        <Button
          size="lg"
          h={64}
          variant={answer === 'composite' ? 'filled' : 'default'}
          color="ink"
          disabled={answered && answer !== 'composite'}
          onClick={() => choose('composite')}
          aria-keyshortcuts="ArrowRight c"
          rightSection={
            <Kbd size="xs" className="hidden fine:inline-block">
              →
            </Kbd>
          }
          styles={{ label: { fontSize: 'var(--fs-1)', fontWeight: 700 } }}
        >
          合成数
        </Button>
      </div>
      {answered && answer !== null ? (
        <Feedback correct={correct}>
          {question.prime ? (
            <p className="m-0">
              <span className="num font-bold">{question.value}</span> は
              <span className="font-bold text-prime">素数</span>です。
            </p>
          ) : (
            <p className="m-0 flex flex-wrap items-baseline gap-x-fib-2">
              <span className="num font-bold">
                {question.value} = <PowerProduct powers={powers} />
              </span>
              <span>なので合成数です。</span>
            </p>
          )}
          {why ? <p className="m-0 text-[length:var(--fs--1)] text-ink-muted">{why}</p> : null}
        </Feedback>
      ) : null}
    </section>
  )
}

export function PrimeRun({ rng }: { rng?: Rng }) {
  return (
    <TrainingRun mode="prime" makeQuestion={makeQuestion} Question={PrimeQuestionView} rng={rng} />
  )
}
