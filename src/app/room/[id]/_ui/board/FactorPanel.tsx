'use client'
/**
 * Factor mode panel (spec §6.2, §7.5, catalogue #16–#17).
 *
 * Typesets the factor expression with `Expr`. Only when the expression is well formed
 * (`isValidFactCardIds`) does it show `= value` and the arithmetic relation to the target
 * (`=` / `≠`). It never says whether a factor is prime: that is the server's call.
 */
import { Expr } from '@/design/Expr'
import { NumberGlyph } from '@/design/NumberGlyph'
import { IconTimes } from '@/design/icons'
import { DUR, EASE, motionPreset, useMotionMode } from '@/design/motion'
import { MathCard, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { evalFactCardIds, isValidFactCardIds } from '@/utils/play-card'
import { AnimatePresence, m } from 'framer-motion'
import type { ReactNode } from 'react'

export type FactorPanelProps = {
  open: boolean
  /** value of the tray the expression must equal */
  target: number
  factCards: FactCardId[]
  onAddOperator: (op: '*' | '^') => void
  onRemove: (index: number) => void
  onClose: () => void
}

export type FactorReadout = { valid: false } | { valid: true; value: number; equal: boolean }

/** `= value` and `=`/`≠ target`, only for a well-formed expression (pure). */
export function factorReadout(factCards: FactCardId[], target: number): FactorReadout {
  if (!isValidFactCardIds(factCards)) {
    return { valid: false }
  }
  const value = evalFactCardIds(factCards)
  return { valid: true, value, equal: value === target }
}

const MIN_TARGET = 44

/** `≟` → `=` / `≠`: two strokes, plus a slash that draws in for `≠` (#17). */
function Relation({ state }: { state: 'pending' | 'equal' | 'unequal' }) {
  const mode = useMotionMode()
  const reduced = mode === 'reduced'
  const t = reduced ? { duration: 0 } : { duration: DUR.md, ease: EASE.out }
  const text = state === 'pending' ? '≟' : state === 'equal' ? '=' : '≠'
  const color =
    state === 'unequal' ? 'var(--danger)' : state === 'equal' ? 'var(--ink)' : 'var(--ink-muted)'
  return (
    <span
      className="relative inline-flex items-center"
      style={{ color, width: '1.1em', height: '1em' }}
      data-relation={state}
      data-motion={mode}
    >
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" fill="none">
        <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <m.path
            d="M5 10h14"
            initial={false}
            animate={{ y: state === 'pending' ? 2 : 0 }}
            transition={t}
          />
          <m.path
            d="M5 16h14"
            initial={false}
            animate={{ y: state === 'pending' ? 2 : 0 }}
            transition={t}
          />
          <m.path
            d="M15 4L9 22"
            initial={false}
            animate={{
              pathLength: state === 'unequal' ? 1 : 0,
              opacity: state === 'unequal' ? 1 : 0,
            }}
            transition={t}
          />
        </g>
        <m.text
          x="12"
          y="7"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="currentColor"
          initial={false}
          animate={{ opacity: state === 'pending' ? 1 : 0 }}
          transition={t}
        >
          ?
        </m.text>
      </svg>
      <span className="sr-only">{text}</span>
    </span>
  )
}

function OpButton({
  label,
  onClick,
  disabled,
  children,
  kind,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  kind: 'times' | 'pow' | 'close'
}) {
  const factor = kind !== 'close'
  return (
    <m.button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-op={kind}
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: DUR.sm, ease: EASE.out } },
      }}
      className={[
        'inline-flex items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-2)] border px-[var(--sp-3)] font-semibold',
        'transition-colors duration-[var(--t-sm)] disabled:cursor-not-allowed disabled:opacity-40',
        factor
          ? 'num border-factor text-factor enabled:hover:bg-[color-mix(in_srgb,var(--factor)_10%,transparent)]'
          : 'border-border-strong text-ink enabled:hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]',
      ].join(' ')}
      style={{ minWidth: MIN_TARGET, minHeight: MIN_TARGET }}
    >
      {children}
    </m.button>
  )
}

export function FactorPanel({
  open,
  target,
  factCards,
  onAddOperator,
  onRemove,
  onClose,
}: FactorPanelProps) {
  const motionMode = useMotionMode()
  const reduced = motionMode === 'reduced'
  const preset = motionPreset(reduced)
  const readout = factorReadout(factCards, target)
  const last = factCards.at(-1)
  const canAddOperator = last !== undefined && isCardId(last)

  const panelVariants = reduced
    ? preset.fadeUp
    : {
        hidden: preset.fadeUp.hidden,
        show: {
          ...(preset.fadeUp.show as object),
          transition: { duration: DUR.md, ease: EASE.out, staggerChildren: 0.034 },
        },
      }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <m.section
          key="factor-panel"
          aria-label="素因数分解"
          data-motion={motionMode}
          data-valid={readout.valid}
          className="relative flex w-full flex-col gap-[var(--sp-1)] rounded-[var(--r-3)] border border-factor bg-surface px-[var(--sp-3)] py-[var(--sp-1)]"
          variants={panelVariants}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, transition: { duration: DUR.sm, ease: EASE.in } }}
        >
          <div className="flex flex-wrap items-center gap-x-[var(--sp-3)] gap-y-[var(--sp-1)]">
            <span className="inline-flex items-baseline gap-[var(--sp-2)]" data-target="">
              <NumberGlyph value={target} size={1} tone="muted" />
              <span className="num text-ink-muted" aria-hidden="true">
                =
              </span>
            </span>

            <div
              // biome-ignore lint/a11y/useSemanticElements: a card listbox, not a <select>
              role="listbox"
              aria-label="因数"
              aria-orientation="horizontal"
              tabIndex={factCards.length === 0 ? 0 : -1}
              className="flex min-h-[var(--card-tray)] min-w-0 flex-1 flex-wrap items-center gap-[var(--sp-1)] outline-none"
            >
              {factCards.length === 0 ? (
                <span className="text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
                  手札から因数を選択
                </span>
              ) : (
                factCards.map((token, index) =>
                  isCardId(token) ? (
                    <MathCard
                      key={token}
                      card={token}
                      size="tray"
                      role="option"
                      aria-selected={true}
                      tabIndex={0}
                      onActivate={() => onRemove(index)}
                    />
                  ) : (
                    <m.button
                      // biome-ignore lint/suspicious/noArrayIndexKey: operators repeat; position is their identity
                      key={`${token}-${index}`}
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: removable token inside the factor listbox
                      role="option"
                      aria-selected={true}
                      aria-label={token === '*' ? '掛ける を削除' : '累乗 を削除'}
                      data-token={token}
                      onClick={() => onRemove(index)}
                      className="num inline-flex items-center justify-center rounded-[var(--r-1)] text-factor hover:bg-[color-mix(in_srgb,var(--factor)_10%,transparent)]"
                      style={{ minWidth: 28, minHeight: MIN_TARGET, fontSize: 'var(--fs-1)' }}
                      initial={reduced ? false : { opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: DUR.sm, ease: EASE.out }}
                    >
                      {token === '*' ? '·' : '^'}
                    </m.button>
                  ),
                )
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-[var(--sp-2)]" data-ops="">
              <OpButton
                kind="times"
                label="掛ける"
                onClick={() => onAddOperator('*')}
                disabled={!canAddOperator}
              >
                <IconTimes size="1.25em" />
                <span className="sr-only">·</span>
              </OpButton>
              <OpButton
                kind="pow"
                label="累乗"
                onClick={() => onAddOperator('^')}
                disabled={!canAddOperator}
              >
                <span aria-hidden="true">xʸ</span>
              </OpButton>
              <OpButton kind="close" label="戻る" onClick={onClose}>
                戻る
              </OpButton>
            </div>
          </div>

          <div
            className="flex flex-wrap items-baseline gap-x-[var(--sp-2)] gap-y-[var(--sp-1)]"
            data-readout=""
            style={{ fontSize: 'var(--fs-2)' }}
          >
            {factCards.length > 0 ? <Expr tokens={factCards} className="font-bold" /> : null}
            {readout.valid ? (
              <>
                <span className="num text-ink-muted" aria-hidden="true">
                  =
                </span>
                <NumberGlyph value={readout.value} size={2} tone="factor" />
                <Relation state={readout.equal ? 'equal' : 'unequal'} />
                <NumberGlyph value={target} size={2} tone={readout.equal ? 'ink' : 'danger'} />
                <span
                  className={`num font-bold ${readout.equal ? 'text-ink' : 'text-danger'}`}
                  aria-hidden="true"
                  data-verdict={readout.equal ? 'equal' : 'unequal'}
                >
                  {readout.equal ? '✓' : '✗'}
                </span>
              </>
            ) : (
              <span
                className="inline-flex items-baseline gap-[var(--sp-2)] text-ink-muted"
                data-pending=""
              >
                <Relation state="pending" />
              </span>
            )}
          </div>
        </m.section>
      ) : null}
    </AnimatePresence>
  )
}
