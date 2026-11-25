'use client'
/**
 * The submit tray (spec §6.2, §7.5, catalogue #13–#15, #18).
 *
 * Arithmetic help only: the value, `≟`, `枚数 k ✓/✗` and `> 場 ✓/✗`. It must never state
 * primality before a server result (spec §0.4); the one allowed exception is the gold `G`
 * at exactly 57, which the old board already showed.
 */
import { NumberGlyph } from '@/design/NumberGlyph'
import { IconQEq, IconRotate2 } from '@/design/icons'
import { DUR, EASE, dampedShake, motionPreset, useMotionMode } from '@/design/motion'
import { type CardId, MathCard } from '@/game-card/src'
import { AnimatePresence, m, useAnimationControls } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { trayChecks } from './card-tray-utils'
import { useRovingListbox } from './use-roving-listbox'

export type SubmitTrayProps = {
  cardIds: CardId[]
  /** current field top, or null when the field is free */
  fieldTop: CardId[] | null
  onRemove: (card: CardId) => void
  onReset: () => void
  /** change to replay the blocked-submit shake */
  shakeKey?: number
  /** inline validation message (aria-live polite) */
  errorMessage?: string | null
  /** factor cards are in play: リセット stays enabled to clear them (and leave factor mode) */
  hasFactor?: boolean
}

function Check({ ok, label, kind }: { ok: boolean; label: string; kind: 'count' | 'greater' }) {
  return (
    <li
      className="inline-flex items-baseline gap-[var(--sp-1)] whitespace-nowrap"
      data-check={kind}
      data-ok={ok}
    >
      <span className="text-ink-muted">{label}</span>
      <span className={`num font-bold ${ok ? 'text-ink' : 'text-danger'}`} aria-hidden="true">
        {ok ? '✓' : '✗'}
      </span>
      <span className="sr-only">{ok ? 'OK' : 'NG'}</span>
    </li>
  )
}

export function SubmitTray({
  cardIds,
  fieldTop,
  onRemove,
  onReset,
  shakeKey,
  errorMessage,
  hasFactor = false,
}: SubmitTrayProps) {
  const motionMode = useMotionMode()
  const reduced = motionMode === 'reduced'
  const preset = motionPreset(reduced)
  const checks = trayChecks(cardIds, fieldTop)
  const n = cardIds.length
  const empty = n === 0
  const gold = checks.isGrothendieck

  /* ---------------- blocked-submit shake (#18) ---------------- */
  const controls = useAnimationControls()
  const lastShakeKey = useRef(shakeKey)
  const [shakes, setShakes] = useState(0)
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (shakeKey === lastShakeKey.current) {
      return
    }
    lastShakeKey.current = shakeKey
    setShakes((v) => v + 1)
    if (reduced) {
      return
    }
    setShaking(true)
    let cancelled = false
    controls
      .start({ x: dampedShake(), transition: { duration: DUR.lg, ease: 'linear' } })
      .then(() => {
        if (!cancelled) {
          setShaking(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [shakeKey, reduced, controls])

  /* ---------------- reset spin (#14) ---------------- */
  const [spins, setSpins] = useState(0)
  const reset = () => {
    setSpins((v) => v + 1)
    onReset()
  }

  /* ---------------- roving tabindex (shared listbox model) ---------------- */
  const roving = useRovingListbox(n, cardIds.join(','))

  const danger = Boolean(errorMessage) || shaking
  const borderColor = danger ? 'var(--danger)' : gold ? 'var(--gold)' : 'var(--line)'

  return (
    <m.div
      className="relative flex w-full flex-col justify-center rounded-[var(--r-3)] bg-surface"
      style={{
        border: `1px solid ${borderColor}`,
        transition: 'border-color var(--t-sm) var(--ease-out)',
        minHeight: 'calc(var(--card-tray) + var(--sp-4))',
      }}
      animate={controls}
      data-motion={motionMode}
      data-empty={empty}
      data-grothendieck={gold ? 'true' : undefined}
      data-shake={shakes > 0 && !reduced ? String(shakeKey) : undefined}
      data-danger={danger ? 'true' : undefined}
    >
      {/* gold border draw at 57 (#15) */}
      {gold ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          data-gold-border=""
        >
          <m.rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="12"
            fill="none"
            stroke="var(--gold)"
            strokeWidth={2}
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DUR.lg, ease: EASE.out }}
          />
        </svg>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-[var(--sp-3)] gap-y-[var(--sp-1)] px-[var(--sp-2)] py-[var(--sp-2)]">
        <button
          type="button"
          aria-label="リセット"
          onClick={reset}
          disabled={empty && !hasFactor}
          className="inline-flex shrink-0 items-center justify-center rounded-[var(--r-2)] text-ink-muted transition-colors duration-[var(--t-sm)] enabled:hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] enabled:hover:text-ink disabled:opacity-40"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <m.span
            key={spins}
            className="inline-flex"
            initial={spins > 0 && !reduced ? { rotate: 0 } : false}
            animate={{ rotate: spins > 0 && !reduced ? -360 : 0 }}
            transition={{ duration: DUR.md, ease: EASE.out }}
          >
            <IconRotate2 stroke={1.5} size="1.25em" aria-hidden="true" />
          </m.span>
        </button>

        <div
          {...roving.listboxProps}
          tabIndex={-1}
          // biome-ignore lint/a11y/useSemanticElements: a card listbox, not a <select>
          role="listbox"
          aria-label="提出"
          aria-orientation="horizontal"
          className="flex min-w-0 items-center gap-[var(--sp-1)] rounded-[var(--r-2)] pt-[var(--sp-2)]"
        >
          {empty ? (
            <span
              aria-hidden="true"
              data-placeholder=""
              className="inline-flex items-center justify-center rounded-[var(--r-2)] border border-border-strong border-dashed text-ink-muted"
              style={{
                height: 'var(--card-tray)',
                width: 'calc(var(--card-tray) * 0.69)',
                fontSize: 'var(--fs--1)',
              }}
            >
              +
            </span>
          ) : (
            cardIds.map((card, i) => (
              <MathCard
                key={card}
                card={card}
                size="tray"
                state="selected"
                role="option"
                aria-selected={true}
                tabIndex={roving.tabIndexFor(i)}
                onActivate={() => onRemove(card)}
              />
            ))
          )}
        </div>

        <div className="flex items-baseline gap-[var(--sp-2)]" data-readout="">
          <span
            className="num text-ink-muted"
            aria-hidden="true"
            style={{ fontSize: 'var(--fs-1)' }}
          >
            =
          </span>
          <span className="relative inline-flex items-baseline overflow-hidden" data-value="">
            <NumberGlyph value={checks.value} size={3} tone={gold ? 'gold' : 'ink'} />
            {gold && !reduced ? (
              <m.span
                key="shimmer"
                aria-hidden="true"
                data-shimmer=""
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(100deg, transparent 25%, color-mix(in srgb, var(--gold) 45%, transparent) 50%, transparent 75%)',
                }}
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: DUR.xxl, ease: EASE.inOut }}
              />
            ) : null}
          </span>
          <AnimatePresence initial={false}>
            {gold ? (
              <m.sup
                key="G"
                className="num font-bold text-gold"
                style={{ fontSize: 'var(--fs--2)' }}
                variants={preset.pop}
                initial="hidden"
                animate="show"
                exit="hidden"
                data-g=""
              >
                <span aria-hidden="true">G</span>
                <span className="sr-only">グロタンディーク</span>
              </m.sup>
            ) : null}
          </AnimatePresence>
          <span className="inline-flex text-ink-muted" data-qeq="">
            <IconQEq size="1.25em" />
            <span className="sr-only">≟</span>
          </span>
        </div>

        {empty ? null : (
          <ul
            aria-label="条件"
            className="flex items-baseline gap-[var(--sp-3)]"
            style={{ fontSize: 'var(--fs--1)' }}
          >
            <Check kind="count" ok={checks.countOk} label={`枚数 ${n}`} />
            <Check kind="greater" ok={checks.greaterOk} label="> 場" />
          </ul>
        )}
      </div>

      <div aria-live="polite" className="px-[var(--sp-3)]" data-error-region="">
        <AnimatePresence initial={false}>
          {errorMessage ? (
            <m.p
              key={errorMessage}
              className="flex items-baseline gap-[var(--sp-1)] pb-[var(--sp-2)] text-danger"
              style={{ fontSize: 'var(--fs--1)' }}
              variants={preset.fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: DUR.sm } }}
            >
              <span aria-hidden="true" className="num font-bold">
                ✗
              </span>
              {errorMessage}
            </m.p>
          ) : null}
        </AnimatePresence>
      </div>
    </m.div>
  )
}
