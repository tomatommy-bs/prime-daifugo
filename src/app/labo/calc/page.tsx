'use client'

import { PlayingCardLine } from '@/components/playing-card-line'
import { TIMES } from '@/design/Expr'
import { NumberGlyph } from '@/design/NumberGlyph'
import { factorize } from '@/design/math/factorize'
import { DUR, EASE, type MotionPreset, useMotionMode, useMotionPreset } from '@/design/motion'
import { type CardId, GameCard, getCardNum } from '@/game-card/src'
import { getCardNumber } from '@/utils/play-card'
import { ActionIcon, Alert, Button, Kbd } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconBackspace, IconExclamationCircle } from '@tabler/icons-react'
import { AnimatePresence, m } from 'framer-motion'
import type { NextPage } from 'next'
import pf from 'primes-and-factors'
import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react'

/** The keypad: the 13 clubs, A … K. */
const cardIds: CardId[] = [
  'AC',
  '2C',
  '3C',
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  '10C',
  'JC',
  'QC',
  'KC',
] as const

/** The key that adds a card (unchanged hotkeys: 1–9, 0 = 10, j/q/k). */
const hotkeyOf = (cardId: CardId): string => {
  const num = getCardNum(cardId)
  switch (num) {
    case 'A':
      return '1'
    case '10':
      return '0'
    case 'J':
    case 'Q':
    case 'K':
      return num.toLowerCase()
    default:
      return num
  }
}

/** Card height on the keypad: fits four rows on a 390px-tall phone, capped on desktop. */
const KEY_CARD_SIZE = 'clamp(40px, 15dvh, 88px)'

/** A factor with its multiplicity, e.g. `2³` → `{ p: '2', e: 3 }`. */
type PrimePower = { p: string; e: number }

type Verdict =
  | { kind: 'empty' }
  | { kind: 'unit' }
  | { kind: 'prime' }
  | { kind: 'composite'; factors: PrimePower[] }
  /** above MAX_SAFE_INTEGER and not factorable within the budget */
  | { kind: 'unknown' }

const groupPowers = (factors: (number | bigint)[]): PrimePower[] => {
  const out: PrimePower[] = []
  for (const f of factors) {
    const p = String(f)
    const last = out.at(-1)
    if (last && last.p === p) {
      last.e += 1
    } else {
      out.push({ p, e: 1 })
    }
  }
  return out
}

/**
 * Judge the concatenated value. Exact `primes-and-factors` up to MAX_SAFE_INTEGER (as
 * before); above it, a budgeted BigInt trial division that may give up.
 */
function judge(digits: string): Verdict {
  if (digits === '') {
    return { kind: 'empty' }
  }
  const asNumber = Number(digits)
  if (asNumber <= Number.MAX_SAFE_INTEGER) {
    if (asNumber === 1) {
      return { kind: 'unit' }
    }
    return pf.isPrime(asNumber)
      ? { kind: 'prime' }
      : { kind: 'composite', factors: groupPowers(pf.getFactors(asNumber)) }
  }
  const factors = factorize(BigInt(digits), 34)
  if (factors === null) {
    return { kind: 'unknown' }
  }
  return factors.length === 1
    ? { kind: 'prime' }
    : { kind: 'composite', factors: groupPowers(factors) }
}

/** `2^3 · 3` read aloud in Japanese. */
const factorsLabel = (factors: PrimePower[]) =>
  factors.map(({ p, e }) => (e > 1 ? `${p} の ${e} 乗` : p)).join(' 掛ける ')

/** The readout steps down for long values so the number never overflows the panel. */
const readoutSize = (length: number) => (length > 13 ? 3 : length > 9 ? 4 : 5)

const Page: NextPage = () => {
  const [selectedCards, setSelectedCards] = useState<CardId[]>([])
  const [pulse, setPulse] = useState<{ card: CardId; n: number } | null>(null)
  const mode = useMotionMode()
  const preset = useMotionPreset()

  const digits = selectedCards.map(getCardNumber).join('')
  const verdict = useMemo(() => judge(digits), [digits])
  const tooLarge = digits !== '' && Number(digits) > Number.MAX_SAFE_INTEGER

  const press = useCallback((cardId: CardId) => {
    setPulse((prev) => ({ card: cardId, n: (prev?.n ?? 0) + 1 }))
  }, [])

  useKeyPress(setSelectedCards, press)

  const handleClickCardOnLine = (_: CardId, idx: number) => {
    setSelectedCards((prev) => {
      const newSelectedCards = [...prev]
      newSelectedCards.splice(idx, 1)
      return newSelectedCards
    })
  }

  const handleClickInputCard = (cardId: CardId) => {
    setSelectedCards((prev) => [...prev, cardId])
    press(cardId)
  }

  return (
    <div
      data-motion={mode}
      className="mx-auto grid w-full max-w-[987px] grid-cols-[1.618fr_1fr] items-stretch gap-fib-4 portrait-phone:grid-cols-1 compact:gap-fib-3"
    >
      {/* readout (0.618) */}
      <section
        aria-label="読み取り"
        className="flex min-w-0 flex-col gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)] compact:p-fib-3"
      >
        <div className="flex min-w-0 items-center gap-fib-3 overflow-x-auto pb-1">
          <span
            className="num shrink-0 text-ink-muted"
            style={{ fontSize: 'var(--fs-2)', lineHeight: 1 }}
            aria-hidden="true"
          >
            <i className="font-serif">n</i> =
          </span>
          <NumberGlyph
            value={digits === '' ? null : digits}
            size={readoutSize(digits.length)}
            srLabel={digits === '' ? 'n は未入力' : `n = ${digits}`}
            className="shrink-0"
          />
        </div>

        <output
          aria-live="polite"
          className="flex min-h-[2.25em] flex-wrap items-baseline gap-x-fib-3 gap-y-1 text-[length:var(--fs-1)]"
          data-verdict={verdict.kind}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {verdict.kind === 'empty' ? null : (
              <m.span
                key={`${verdict.kind}-${digits}`}
                variants={preset.fadeUp}
                initial="hidden"
                animate="show"
                exit="hidden"
                className="inline-flex flex-wrap items-baseline gap-x-fib-3"
              >
                <VerdictLine verdict={verdict} preset={preset} />
              </m.span>
            )}
          </AnimatePresence>
        </output>

        {tooLarge && (
          <Alert
            icon={<IconExclamationCircle stroke={1.5} />}
            title="数が大きすぎます"
            variant="light"
            color="red"
            radius="md"
          >
            <p>
              Javascript で扱える最大の整数は{' '}
              <span className="num">{Number.MAX_SAFE_INTEGER.toLocaleString()}</span> です。
            </p>
          </Alert>
        )}

        <div className="mt-auto flex min-w-0 items-center gap-fib-2 border-t border-line pt-fib-3">
          <div className="min-h-16 min-w-0 flex-1">
            {selectedCards.length === 0 ? (
              <p className="text-[length:var(--fs--1)] text-ink-muted">
                カードを選ぶと数が並びます
                <span className="hidden fine:inline">
                  {' '}
                  · キー <span className="num">1–9 · 0 = 10 · j q k</span>
                </span>
              </p>
            ) : (
              <PlayingCardLine
                size="s"
                cardIds={selectedCards}
                onClickCard={handleClickCardOnLine}
                aria-label="選んだカード"
              />
            )}
          </div>
          <span className="num shrink-0 text-[length:var(--fs--1)] text-ink-muted">
            k = {selectedCards.length}
          </span>
          <ActionIcon
            onClick={() => setSelectedCards((prev) => prev.slice(0, -1))}
            aria-label="1枚戻す"
            aria-keyshortcuts="Backspace"
            disabled={selectedCards.length === 0}
            color="ink"
          >
            <IconBackspace stroke={1.5} size="1.25em" />
          </ActionIcon>
          <Button
            variant="default"
            onClick={() => setSelectedCards([])}
            aria-keyshortcuts="Escape"
            rightSection={
              <Kbd size="xs" className="hidden fine:inline-block">
                Esc
              </Kbd>
            }
          >
            クリア
          </Button>
        </div>
      </section>

      {/* keypad (0.382) */}
      <section
        aria-label="キーパッド（♣）"
        className="grid grid-cols-12 content-center justify-items-center gap-fib-2 rounded-[var(--r-3)] border border-line bg-surface p-fib-3 shadow-[var(--shadow-1)]"
      >
        {cardIds.map((cardId, i) => (
          <KeypadKey
            key={cardId}
            cardId={cardId}
            // A–9 in rows of three, then 10 J Q K in a row of four
            span={i < 9 ? 'col-span-4' : 'col-span-3'}
            pulse={pulse?.card === cardId ? pulse.n : null}
            reduced={mode === 'reduced'}
            onPress={handleClickInputCard}
          />
        ))}
      </section>
    </div>
  )
}

/** The verdict text; the parent `m.span` carries the enter/exit motion. */
function VerdictLine({ verdict, preset }: { verdict: Verdict; preset: MotionPreset }) {
  switch (verdict.kind) {
    case 'prime':
      return (
        <>
          <span className="num font-bold">
            <i className="font-serif">n</i> ∈ ℙ
          </span>
          <span className="inline-flex items-center gap-fib-1 font-bold text-prime">
            <m.span
              variants={preset.pop}
              initial="hidden"
              animate="show"
              aria-hidden="true"
              className="inline-block size-[0.62em] rounded-[2px] bg-prime"
            />
            素数
          </span>
        </>
      )
    case 'composite':
      return (
        <>
          <span
            className="num font-bold"
            role="math"
            aria-label={`n = ${factorsLabel(verdict.factors)}`}
            data-testid="factorization"
          >
            <i className="font-serif text-ink-muted">n</i>
            <span className="text-ink-muted"> = </span>
            {verdict.factors.map(({ p, e }, i) => (
              <span key={p}>
                {i > 0 ? <span className="text-factor">{TIMES}</span> : null}
                <span className="text-prime">{p}</span>
                {e > 1 ? (
                  <sup className="text-factor" style={{ fontSize: 'var(--fs--2)' }}>
                    {e}
                  </sup>
                ) : null}
              </span>
            ))}
          </span>
          <span className="text-ink-muted">
            <span aria-hidden="true">✗ </span>合成数
          </span>
        </>
      )
    case 'unit':
      return (
        <>
          <span className="num font-bold">
            <i className="font-serif">n</i> = 1 ∉ ℙ
          </span>
          <span className="text-ink-muted">単数（素数でも合成数でもない）</span>
        </>
      )
    default:
      // 'unknown' (above MAX_SAFE_INTEGER and beyond the factoring budget); 'empty' never renders
      return (
        <>
          <span className="num font-bold">
            <i className="font-serif">n</i> ≟ ℙ
          </span>
          <span className="text-ink-muted">大きすぎて判定を省略しました</span>
        </>
      )
  }
}

function KeypadKey({
  cardId,
  span,
  pulse,
  reduced,
  onPress,
}: {
  cardId: CardId
  span: string
  pulse: number | null
  reduced: boolean
  onPress: (cardId: CardId) => void
}) {
  const key = hotkeyOf(cardId)
  const num = getCardNum(cardId)
  return (
    <button
      type="button"
      className={`${span} group relative rounded-[var(--r-2)] p-1 transition-transform duration-[var(--t-sm)] ease-[var(--ease-out)] active:scale-95 fine:hover:-translate-y-1`}
      onClick={() => onPress(cardId)}
      aria-label={`クラブの${num}を追加`}
      aria-keyshortcuts={key}
      data-card-key={cardId}
    >
      <GameCard
        card={cardId}
        role="presentation"
        aria-hidden={true}
        fontSize={KEY_CARD_SIZE}
        className="rounded-[var(--r-2)] shadow-[var(--shadow-1)] transition-shadow duration-[var(--t-sm)] fine:group-hover:shadow-[var(--shadow-2)]"
      />
      {!reduced && pulse !== null ? (
        <m.span
          key={pulse}
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 rounded-[var(--r-2)] ring-2 ring-mod"
          initial={{ opacity: 0.9, scale: 0.94 }}
          animate={{ opacity: 0, scale: 1.08 }}
          transition={{ duration: DUR.lg, ease: EASE.out }}
        />
      ) : null}
      <Kbd
        size="xs"
        aria-hidden="true"
        className="absolute -right-1 -top-1 hidden fine:inline-block"
      >
        {key}
      </Kbd>
    </button>
  )
}

const useKeyPress = (
  callback: Dispatch<SetStateAction<CardId[]>>,
  onPress: (cardId: CardId) => void,
) => {
  const add = (cardId: CardId) => () => {
    callback((prev) => [...prev, cardId])
    onPress(cardId)
  }
  return useHotkeys([
    ['escape', () => callback([])],
    ['backspace', () => callback((prev) => prev.slice(0, -1))],
    ['mod+backspace', () => callback([])],
    ['1', add('AC')],
    ['2', add('2C')],
    ['3', add('3C')],
    ['4', add('4C')],
    ['5', add('5C')],
    ['6', add('6C')],
    ['7', add('7C')],
    ['8', add('8C')],
    ['9', add('9C')],
    ['0', add('10C')],
    ['j', add('JC')],
    ['q', add('QC')],
    ['k', add('KC')],
  ])
}

export default Page
