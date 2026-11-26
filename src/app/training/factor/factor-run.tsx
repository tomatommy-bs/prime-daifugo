'use client'

import { Expr } from '@/design/Expr'
import { type CardId, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import type { Rng } from '@/shared/rng'
import { concat } from '@/training/cards'
import {
  type FactorQuestion,
  type FactorVerdict,
  factorQuestion,
  judgeFactor,
} from '@/training/factor-hunt'
import type { Level } from '@/training/levels'
import { ActionIcon, Button, Kbd, SegmentedControl } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconBackspace, IconBan, IconFlag } from '@tabler/icons-react'
import { useState } from 'react'
import { HandPicker, RankChips, Tray, TrayCard, fromCard } from '../_ui/cards'
import { Feedback } from '../_ui/feedback'
import { type QuestionProps, TrainingRun } from '../_ui/training-run'

/** Patterns listed after a question; the rest are summarised. */
const SHOWN_PATTERNS = 8

const makeQuestion = (rng: Rng, level: Level) => factorQuestion(rng, level)

type Target = 'composite' | 'expression'

type Outcome =
  | { kind: 'answer'; verdict: FactorVerdict }
  | { kind: 'give-up' }
  | { kind: 'no-answer' }

const REASON: Record<Extract<FactorVerdict, { ok: false }>['reason'], string> = {
  'no-composite': '出す合成数を並べてください。',
  'no-expression': '素因数分解の式を並べてください。',
  malformed: '式の形が正しくありません（× や ^ が端にある、続いている、1 を使っているなど）。',
  'not-equal': '式の値が出す数と一致しません。',
  'not-prime': '式に素数でない因数が含まれています。',
}

function FactorQuestionView({ question: q, answered, onAnswer }: QuestionProps<FactorQuestion>) {
  const [composite, setComposite] = useState<CardId[]>([])
  const [expression, setExpression] = useState<FactCardId[]>([])
  const [target, setTarget] = useState<Target>('composite')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const used = new Set<CardId>([...composite, ...expression.filter(isCardId)])

  const toggle = (card: CardId) => {
    if (composite.includes(card)) {
      setComposite((prev) => prev.filter((c) => c !== card))
    } else if (expression.includes(card)) {
      setExpression((prev) => prev.filter((t) => t !== card))
    } else if (target === 'composite') {
      setComposite((prev) => [...prev, card])
    } else {
      setExpression((prev) => [...prev, card])
    }
  }
  const addOperator = (op: '*' | '^') => {
    setTarget('expression')
    setExpression((prev) => [...prev, op])
  }
  const backspace = () =>
    target === 'composite'
      ? setComposite((prev) => prev.slice(0, -1))
      : setExpression((prev) => prev.slice(0, -1))
  const clear = () => {
    setComposite([])
    setExpression([])
    setTarget('composite')
  }
  const submit = () => {
    if (answered || composite.length === 0 || expression.length === 0) {
      return
    }
    const verdict = judgeFactor(composite, expression)
    setOutcome({ kind: 'answer', verdict })
    onAnswer(verdict.ok)
  }
  const giveUp = () => {
    if (answered) {
      return
    }
    setOutcome({ kind: 'give-up' })
    onAnswer(false)
  }
  const sayNoAnswer = () => {
    if (answered) {
      return
    }
    setOutcome({ kind: 'no-answer' })
    onAnswer(q.patterns.length === 0)
  }
  useHotkeys(
    answered
      ? []
      : [
          ['Enter', (e) => !fromCard(e) && submit()],
          ['Backspace', backspace],
          ['Escape', clear],
          ['x', () => addOperator('*')],
          ['shift+8', () => addOperator('*')],
          ['shift+6', () => addOperator('^')],
          ['n', sayNoAnswer],
        ],
  )

  const userKey = outcome?.kind === 'answer' && outcome.verdict.ok ? outcome.verdict.key : null

  return (
    <section
      aria-label="問題"
      className="flex flex-col gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:p-fib-3"
    >
      <p className="m-0 text-ink-muted [text-wrap:pretty]">
        手札から合成数を 1 つ選び、残りのカードでその素因数分解の式をつくろう
      </p>

      <div className="grid grid-cols-[minmax(0,0.382fr)_minmax(0,0.618fr)] gap-fib-2 portrait-phone:grid-cols-1">
        <Tray
          label="出す数"
          active={!answered && target === 'composite'}
          empty={composite.length === 0}
          readout={
            composite.length > 0 ? (
              <span className="num font-bold" data-composite-value="">
                {concat(composite)}
              </span>
            ) : null
          }
        >
          {composite.map((card) => (
            <TrayCard key={card} card={card} disabled={answered} onRemove={() => toggle(card)} />
          ))}
        </Tray>
        <Tray
          label="式"
          active={!answered && target === 'expression'}
          empty={expression.length === 0}
          readout={
            expression.length > 0 ? <Expr tokens={expression} className="num font-bold" /> : null
          }
        >
          {expression.map((token, i) =>
            isCardId(token) ? (
              <TrayCard
                key={token}
                card={token}
                disabled={answered}
                onRemove={() => toggle(token)}
              />
            ) : (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: operators repeat; position is identity
                key={`${token}-${i}`}
                type="button"
                disabled={answered}
                onClick={() => setExpression((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`${token === '*' ? '×' : '累乗'}を消す`}
                className="num rounded-[var(--r-1)] px-1 text-[length:var(--fs-2)] font-bold text-factor"
              >
                {token === '*' ? '×' : '^'}
              </button>
            ),
          )}
        </Tray>
      </div>

      {answered ? null : (
        <div className="flex flex-wrap items-center gap-fib-2">
          <SegmentedControl
            aria-label="カードの置き先"
            size="sm"
            value={target}
            onChange={(v) => setTarget(v as Target)}
            data={[
              { value: 'composite', label: '出す数' },
              { value: 'expression', label: '式' },
            ]}
          />
          <Button
            variant="default"
            onClick={() => addOperator('*')}
            aria-label="掛ける"
            aria-keyshortcuts="x"
            className="num"
            rightSection={
              <Kbd size="xs" className="hidden fine:inline-block">
                x
              </Kbd>
            }
          >
            ×
          </Button>
          <Button
            variant="default"
            onClick={() => addOperator('^')}
            aria-label="累乗"
            aria-keyshortcuts="^"
            className="num"
            rightSection={
              <Kbd size="xs" className="hidden fine:inline-block">
                ^
              </Kbd>
            }
          >
            ^
          </Button>
          <ActionIcon
            onClick={backspace}
            aria-label="1つ戻す"
            aria-keyshortcuts="Backspace"
            disabled={composite.length === 0 && expression.length === 0}
            color="ink"
            className="ml-auto"
          >
            <IconBackspace stroke={1.5} size="1.25em" />
          </ActionIcon>
        </div>
      )}

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
          <Button
            variant="default"
            onClick={sayNoAnswer}
            aria-keyshortcuts="n"
            leftSection={<IconBan stroke={1.5} size="1.1em" />}
            rightSection={
              <Kbd size="xs" className="hidden fine:inline-block">
                N
              </Kbd>
            }
          >
            解なし
          </Button>
          <Button
            size="md"
            className="ml-auto"
            disabled={composite.length === 0 || expression.length === 0}
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
          correct={
            outcome.kind === 'no-answer'
              ? q.patterns.length === 0
              : outcome.kind === 'answer' && outcome.verdict.ok
          }
          title={outcome.kind === 'give-up' ? '答え' : undefined}
        >
          {q.patterns.length === 0 ? (
            <p className="m-0" data-no-answer="">
              <span className="font-bold">解なし</span>：この手札では、{q.maxCards}{' '}
              枚以下の合成数で合成数出しはできません。
            </p>
          ) : null}
          {outcome.kind === 'no-answer' && q.patterns.length > 0 ? (
            <p className="m-0">解はあります。</p>
          ) : null}
          {outcome.kind === 'answer' && !outcome.verdict.ok ? (
            <p className="m-0">{REASON[outcome.verdict.reason]}</p>
          ) : null}
          {q.patterns.length > 0 ? <Patterns q={q} highlight={userKey} /> : null}
        </Feedback>
      ) : null}
    </section>
  )
}

function Patterns({ q, highlight }: { q: FactorQuestion; highlight: string | null }) {
  const shown = q.patterns.slice(0, SHOWN_PATTERNS)
  const rest = q.patterns.length - shown.length
  return (
    <div className="flex flex-col gap-fib-1">
      <p className="m-0 text-[length:var(--fs--1)] text-ink-muted">
        この手札でできる合成数出し（{q.maxCards} 枚以下の合成数、{q.patterns.length} 通り）
      </p>
      <ul className="m-0 flex list-none flex-col gap-fib-1 p-0" aria-label="できる合成数出し">
        {shown.map((p) => (
          <li
            key={p.key}
            data-pattern={p.key}
            className={`flex flex-wrap items-center gap-fib-2 rounded-[var(--r-1)] border px-fib-2 py-1 ${p.key === highlight ? 'border-prime' : 'border-line'}`}
          >
            <RankChips cards={p.composite} />
            <span className="num font-bold">{p.value}</span>
            <span className="text-ink-muted">=</span>
            <Expr tokens={p.expression} className="num font-bold" />
            <RankChips cards={p.expression.filter(isCardId)} className="ml-auto" />
          </li>
        ))}
        {rest > 0 ? (
          <li className="text-[length:var(--fs--1)] text-ink-muted">ほか {rest} 通り</li>
        ) : null}
      </ul>
    </div>
  )
}

export function FactorRun({ rng }: { rng?: Rng }) {
  return (
    <TrainingRun
      mode="factor"
      makeQuestion={makeQuestion}
      Question={FactorQuestionView}
      rng={rng}
    />
  )
}
