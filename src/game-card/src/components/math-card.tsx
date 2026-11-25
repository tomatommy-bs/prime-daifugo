'use client'

import { DUR, EASE, dampedShake, motionPreset, useMotionMode } from '@/design/motion'
import { AnimatePresence, type HTMLMotionProps, m } from 'framer-motion'
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useEffect,
  useState,
} from 'react'
import { cardLabel, cardValue, rankBadge } from '../tools/card-label'
import type { CardId } from '../tools/suit-num'
import { GameCard, type GameCardProps } from './game-card'

export type MathCardState = 'rest' | 'selected' | 'disabled' | 'confirmed' | 'error' | 'fresh'

/** A named card slot (backed by `--card-*` tokens) or any CSS length (the card height). */
export type MathCardSize = 'hand' | 'field' | 'tray' | 'seat' | (string & {})

/** Motion props forwarded to the root `m.div` (fan positions, enter/exit, …). */
export type MathCardMotionProps = Pick<
  HTMLMotionProps<'div'>,
  | 'initial'
  | 'animate'
  | 'exit'
  | 'transition'
  | 'variants'
  | 'custom'
  | 'layout'
  | 'whileHover'
  | 'whileTap'
  | 'onAnimationComplete'
>

export interface MathCardProps {
  card: CardId | 'Back'
  size: MathCardSize
  state?: MathCardState
  /** value chip under the card (A = 1 … K = 13) */
  showValue?: boolean
  /** shared-layout id; defaults to `card-${card}` (the 52 ids are unique) */
  layoutId?: string
  /** default `option` when activatable, otherwise `img` */
  role?: string
  tabIndex?: number
  'aria-selected'?: boolean
  /** overrides the `cardLabel()` default */
  'aria-label'?: string
  onActivate?: () => void
  motionProps?: MathCardMotionProps
  /** extra props for the inner `GameCard` svg (role and sizing are managed here) */
  cardProps?: Omit<GameCardProps, 'card' | 'role' | 'ref'>
  className?: string
  style?: CSSProperties
}

const SIZE_VAR: Record<string, string> = {
  hand: 'var(--card-hand)',
  field: 'var(--card-field)',
  tray: 'var(--card-tray)',
  seat: 'var(--card-seat)',
}

/** Card height for a `MathCardSize`. */
export const cardHeight = (size: MathCardSize): string => SIZE_VAR[size] ?? size

/** How long the error outline stays (§8.1). */
export const ERROR_OUTLINE_MS = 610

const RING: Partial<Record<MathCardState, string>> = {
  selected: '0 0 0 2px var(--ink)',
}

/**
 * The card frame (spec §8.1): a `m.div` around `GameCard` that carries the state visuals.
 *
 * - rest: white face, hairline, `--r-2` clip, `--shadow-1`
 * - hover (`pointer: fine` only): lift by `h/φ⁴` (max 8px) and `--shadow-2`
 * - focus-visible: 2px `--mod` ring around the face
 * - selected: `--ink` ring and a rank badge (`J = 11`)
 * - disabled: `saturate(.618)`, opacity stays 1, `aria-disabled`
 * - confirmed: `--prime` underline bar
 * - error: `--danger` outline for 610 ms and a damped shake
 * - fresh: `--gold` underline tick
 */
function MathCardImpl({
  card,
  size,
  state = 'rest',
  showValue = false,
  layoutId,
  role,
  tabIndex,
  'aria-selected': ariaSelected,
  'aria-label': ariaLabel,
  onActivate,
  motionProps,
  cardProps,
  className = '',
  style,
}: MathCardProps) {
  const mode = useMotionMode()
  const reduced = mode === 'reduced'
  const preset = motionPreset(reduced)
  const height = cardHeight(size)
  const disabled = state === 'disabled'
  const interactive = onActivate !== undefined
  const resolvedLayoutId = layoutId ?? (card === 'Back' ? undefined : `card-${card}`)
  const badge = state === 'selected' ? rankBadge(card) : null

  // The danger outline is visible for 610 ms after entering the error state.
  const [errorVisible, setErrorVisible] = useState(state === 'error')
  useEffect(() => {
    if (state !== 'error') {
      setErrorVisible(false)
      return
    }
    setErrorVisible(true)
    if (reduced) {
      return // reduced motion keeps the outline while the state lasts
    }
    const id = setTimeout(() => setErrorVisible(false), ERROR_OUTLINE_MS)
    return () => clearTimeout(id)
  }, [state, reduced])

  const activate = () => {
    if (!disabled) {
      onActivate?.()
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || e.target !== e.currentTarget) {
      return
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      activate()
    }
  }
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (interactive && e.button === 0) {
      activate()
    }
  }

  const rootStyle = {
    '--mc-h': height,
    '--mc-lift': 'min(8px, calc(var(--mc-h) * 0.146))',
    filter: disabled ? 'saturate(.618)' : undefined,
    opacity: 1,
    ...style,
  } as CSSProperties

  const hover = interactive
    ? 'fine:hover:[translate:0_calc(-1*var(--mc-lift))] fine:hover:z-10 cursor-pointer'
    : ''

  return (
    <m.div
      role={role ?? (interactive ? 'option' : 'img')}
      aria-label={ariaLabel ?? cardLabel(card)}
      aria-selected={ariaSelected}
      aria-disabled={disabled ? true : undefined}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      data-card={card}
      data-state={state}
      data-motion={mode}
      data-layout-id={resolvedLayoutId}
      layoutId={resolvedLayoutId}
      transition={preset.card}
      {...motionProps}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`group/mc relative inline-flex shrink-0 select-none flex-col items-center outline-none transition-[translate,filter] duration-[var(--t-sm)] ease-[var(--ease-out)] ${hover} ${className}`}
      style={rootStyle}
    >
      <m.div
        className="relative"
        data-face-wrap=""
        animate={state === 'error' && !reduced ? { x: dampedShake() } : { x: 0 }}
        transition={{ duration: DUR.lg, ease: 'linear' }}
      >
        <div
          data-face=""
          className={[
            'relative overflow-hidden border border-border-strong dark:border-[rgb(236_233_226/.25)]',
            'shadow-[var(--shadow-1)] transition-shadow duration-[var(--t-sm)]',
            interactive ? 'fine:group-hover/mc:shadow-[var(--shadow-2)]' : '',
            'group-focus-visible/mc:outline-2 group-focus-visible/mc:outline-offset-2 group-focus-visible/mc:outline-solid group-focus-visible/mc:outline-mod',
          ].join(' ')}
          style={{
            height,
            width: `calc(${height} * 0.69)`,
            borderRadius: 'min(var(--r-2), calc(var(--mc-h) * 0.06))',
            background: card === 'Back' ? '#15171C' : 'var(--card-face)',
            boxShadow: RING[state],
          }}
        >
          <GameCard
            {...cardProps}
            card={card}
            role="presentation"
            aria-hidden={true}
            focusable="false"
            style={{
              display: 'block',
              fontSize: height,
              width: '100%',
              height: '100%',
              ...cardProps?.style,
            }}
          />
        </div>

        {badge ? (
          <span
            aria-hidden="true"
            data-badge=""
            className="num pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap rounded-[var(--r-1)] bg-ink px-[3px] font-semibold text-bg leading-none tracking-[-0.04em]"
            style={{ top: -7, fontSize: 'var(--fs--1)', paddingBlock: 2 }}
          >
            {/* mono spaces are a full cell wide: drop them so `J=11` fits a tray card */}
            {badge.replaceAll(' ', '')}
          </span>
        ) : null}

        <AnimatePresence initial={false}>
          {state === 'confirmed' ? (
            <m.span
              key="confirmed"
              aria-hidden="true"
              data-marker="confirmed"
              className="pointer-events-none absolute right-[8%] left-[8%] h-[2px] origin-center rounded-full bg-prime"
              style={{ top: 'calc(100% + 4px)' }}
              initial={reduced ? { opacity: 0 } : { scaleX: 0 }}
              animate={reduced ? { opacity: 1 } : { scaleX: 1 }}
              exit={{ opacity: 0, transition: { duration: DUR.sm } }}
              transition={reduced ? { duration: DUR.sm } : { duration: DUR.md, ease: EASE.out }}
            />
          ) : null}
          {state === 'fresh' ? (
            <m.span
              key="fresh"
              aria-hidden="true"
              data-marker="fresh"
              className="pointer-events-none absolute right-[30%] left-[30%] h-[2px] origin-center rounded-full bg-gold"
              style={{ top: 'calc(100% + 4px)' }}
              initial={reduced ? { opacity: 0 } : { scaleX: 0, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: DUR.md, ease: EASE.in } }}
              transition={reduced ? { duration: DUR.sm } : { duration: DUR.md, ease: EASE.out }}
            />
          ) : null}
          {errorVisible ? (
            <m.span
              key="error"
              aria-hidden="true"
              data-marker="error"
              className="pointer-events-none absolute inset-0"
              style={{
                borderRadius: 'min(var(--r-2), calc(var(--mc-h) * 0.06))',
                boxShadow: '0 0 0 2px var(--danger)',
              }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: DUR.md } }}
            />
          ) : null}
        </AnimatePresence>
      </m.div>

      {showValue && card !== 'Back' ? (
        <span
          aria-hidden="true"
          data-value-chip=""
          className="num mt-[10px] text-ink-muted tabular-nums leading-none"
          style={{ fontSize: 'var(--fs--1)' }}
        >
          {cardValue(card)}
        </span>
      ) : null}
    </m.div>
  )
}

export const MathCard = memo(MathCardImpl)
MathCard.displayName = 'MathCard'

export default MathCard
