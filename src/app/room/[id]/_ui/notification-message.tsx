import { WORLD_CONFIG } from '@/constants/config'
/**
 * Toast and log copy for board events (§6.4). Same component names and props as before;
 * restyled with tokens, `NumberGlyph` and `Expr`. Everything renders phrasing content
 * (`<span>`), so a message can sit inside a `<p>` without nesting block elements.
 *
 * These messages are shown only after the server has judged a play, so the colour of a
 * value may reflect the result (prime for a confirmed prime, danger for a failure).
 */
import { Expr } from '@/design/Expr'
import { NumberGlyph } from '@/design/NumberGlyph'
import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { concatCardNumbers } from '@/utils/play-card'
import type React from 'react'
import { type ReactNode, isValidElement } from 'react'
import type { LogEntry, SubmitResultCode } from './board/types'

const GROTHENDIECK_PRIME: number = WORLD_CONFIG.GROTHENDIECK_PRIME

const Sender: React.FC<{ name?: string }> = ({ name }) => (
  <span
    data-sender=""
    className="inline-flex items-center gap-fib-1 rounded-[var(--r-1)] bg-bg px-fib-1 font-semibold text-ink ring-1 ring-line"
  >
    {name ?? '—'}
  </span>
)

const Value: React.FC<{ cards: CardId[]; tone?: 'ink' | 'prime' | 'gold' | 'danger' }> = ({
  cards,
  tone = 'ink',
}) => <NumberGlyph value={concatCardNumbers(cards)} size={0} tone={tone} />

const Mark: React.FC<{ children: ReactNode; className: string }> = ({ children, className }) => (
  <span aria-hidden="true" className={`num font-bold ${className}`}>
    {children}
  </span>
)

const Line: React.FC<{ children: ReactNode; tone?: 'default' | 'fail' }> = ({
  children,
  tone = 'default',
}) => (
  <span
    data-tone={tone}
    className="inline-flex flex-wrap items-baseline gap-x-fib-1 gap-y-0 leading-[1.5] text-ink"
  >
    {children}
  </span>
)

const Chat: React.FC<{
  sender?: string
  message?: string
}> = (props) => {
  if (props.sender === undefined) {
    return <>{props.message}</>
  }
  return (
    <Line>
      <Sender name={props.sender} />: <span>{props.message}</span>
    </Line>
  )
}

const OnPass: React.FC<{
  sender?: string
}> = (props) => (
  <Line>
    <Sender name={props.sender} /> がパスしました <Mark className="text-ink-muted">∅</Mark>
  </Line>
)

const OnSubmitSuccessful: React.FC<{
  sender?: string
  submit: CardId[]
  factor?: FactCardId[]
}> = (props) => {
  if (props.factor !== undefined) {
    return (
      <Line>
        <Sender name={props.sender} /> が<Value cards={props.submit} />
        <span className="num">=</span>
        <Expr tokens={props.factor} className="font-bold text-factor" />
        を出しました
      </Line>
    )
  }
  return (
    <Line>
      <Sender name={props.sender} /> が<Value cards={props.submit} tone="prime" />
      を出しました <Mark className="text-prime">∴</Mark>
    </Line>
  )
}

const OnSubmitWithGrothendieck: React.FC<{
  sender?: string
  submit: CardId[]
}> = (props) => {
  return (
    <Line>
      <Sender name={props.sender} /> の
      <span className="font-bold text-gold">
        グロタンディーク素数 <Value cards={props.submit} tone="gold" />
      </span>
      切り！
    </Line>
  )
}

const OnSubmitNotPrime: React.FC<{
  sender?: string
  submit: CardId[]
}> = (props) => {
  return (
    <Line tone="fail">
      <Sender name={props.sender} /> が<Value cards={props.submit} />
      を出しましたが、素数ではありません <Mark className="text-danger">✗</Mark>
    </Line>
  )
}

const FailWithFactor: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
  reason: string
}> = ({ sender, submit, factor, reason }) => (
  <Line tone="fail">
    <Sender name={sender} /> が<Value cards={submit} />
    <span className="num">=</span>
    <Expr tokens={factor} className="font-bold" />
    を出しましたが{reason} <Mark className="text-danger">✗</Mark>
  </Line>
)

const OnSubmitWithInvalidFactor: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => <FailWithFactor {...props} reason="素因数分解として成立していません" />

const OnSubmitWithPrimeFactor: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => <FailWithFactor {...props} reason="因数に素数以外のカードが含まれています" />

const OnSubmitWithWrongEquation: React.FC<{
  sender?: string
  submit: CardId[]
  factor: FactCardId[]
}> = (props) => <FailWithFactor {...props} reason="等式が間違っています" />

/* ------------------------------------------------------------------ */
/* Board-event notices (additions; the names above are the contract)  */
/* ------------------------------------------------------------------ */

const Notice: React.FC<{ kind: LogKind; children: ReactNode; className?: string }> = ({
  kind,
  children,
  className = '',
}) => (
  <span data-log-kind={kind} className={className}>
    {children}
  </span>
)

/** Proof-log line kinds. */
export type LogKind = NonNullable<LogEntry['kind']>

export const DrawNotice: React.FC<{ sender?: string }> = ({ sender }) => (
  <Notice kind="system">
    <Line>
      <Sender name={sender} /> がドローしました
    </Line>
  </Notice>
)

export const EndNotice: React.FC<{ winner: string }> = ({ winner }) => (
  <Notice kind="end">
    <Line>
      <Sender name={winner} /> の勝利です <Mark className="text-gold">∎</Mark>
    </Line>
  </Notice>
)

export const SystemNotice: React.FC<{ children: ReactNode }> = ({ children }) => (
  <Notice kind="system" className="font-bold">
    {children}
  </Notice>
)

/**
 * The toasts for one judged submission, in order: the success line (with the factor
 * expression when one was given) and the 57 cut, or the failure line.
 */
export function submitNotices(
  sender: string,
  submitCardSet: { submit: CardId[]; factor: FactCardId[] },
  result: SubmitResultCode | null,
): { message: ReactNode; color?: string }[] {
  const { submit, factor } = submitCardSet
  if (result === null) {
    const notices: { message: ReactNode; color?: string }[] = [
      {
        message: (
          <OnSubmitSuccessful
            sender={sender}
            submit={submit}
            factor={factor.length > 0 ? factor : undefined}
          />
        ),
      },
    ]
    if (concatCardNumbers(submit) === GROTHENDIECK_PRIME) {
      notices.push({
        message: <OnSubmitWithGrothendieck sender={sender} submit={submit} />,
        color: 'green',
      })
    }
    return notices
  }
  const Content = {
    BASE_IS_NOT_PRIME: OnSubmitNotPrime,
    INVALID_FACT: OnSubmitWithInvalidFactor,
    FACT_CONTAIN_NOT_PRIME: OnSubmitWithPrimeFactor,
    INCORRECT_ANSWER: OnSubmitWithWrongEquation,
  }[result]
  return [{ message: <Content sender={sender} submit={submit} factor={factor} />, color: 'red' }]
}

/** The proof-log kind of a notice element (falls back to `system`). */
export function logKindOf(node: ReactNode): LogKind {
  if (!isValidElement(node)) {
    return 'system'
  }
  const type = node.type
  if (type === OnPass) {
    return 'pass'
  }
  if (type === OnSubmitSuccessful || type === OnSubmitWithGrothendieck) {
    return 'play'
  }
  if (
    type === OnSubmitNotPrime ||
    type === OnSubmitWithInvalidFactor ||
    type === OnSubmitWithPrimeFactor ||
    type === OnSubmitWithWrongEquation
  ) {
    return 'fail'
  }
  if (type === EndNotice) {
    return 'end'
  }
  const kind = (node.props as { 'data-log-kind'?: LogKind; kind?: LogKind })['data-log-kind']
  return kind ?? 'system'
}

const NotifyMessageContent = {
  Chat,
  OnPass,
  OnSubmitSuccessful,
  OnSubmitWithGrothendieck,
  OnSubmitNotPrime,
  OnSubmitWithInvalidFactor,
  OnSubmitWithPrimeFactor,
  OnSubmitWithWrongEquation,
}

export default NotifyMessageContent
