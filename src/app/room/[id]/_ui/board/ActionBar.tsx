'use client'
/**
 * The game actions (§7.5, §6.4). Three orientations:
 * - `rail` (compact / regular): a 168px right rail. `[引く][パス]` (44px), `[素因数分解]`
 *   (44px), and `[出す]` (55px, prime fill) at the bottom, within thumb reach.
 * - `row` (wide): `[素因数分解][パス][出す]` beside the tray; drawing lives on the deck.
 * - `bottom` (portrait): four 55px buttons in one row.
 * Disabled buttons explain why (tooltip + `aria-describedby`). `Kbd` hints only for
 * `pointer: fine`. Owns the D / P / F / Enter shortcuts (§9.5).
 */
import { IconDrawCard, IconEmpty, IconSubmit, IconTree } from '@/design/icons'
import { Kbd, Tooltip, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import type { DrawDisabledReason } from './types'

export type ActionBarProps = {
  canDraw: boolean
  drawReason: DrawDisabledReason | null
  canPass: boolean
  canSubmit: boolean
  factorMode: boolean
  factorDisabled: boolean
  isMyTurn: boolean
  onDraw: () => void
  onPass: () => void
  onSubmit: () => void
  onToggleFactor: () => void
  orientation: 'rail' | 'row' | 'bottom'
  /** keyboard hints; defaults to `(pointer: fine)` */
  showKbd?: boolean
  /** register the D / P / F / Enter shortcuts (default true) */
  shortcuts?: boolean
}

export const DRAW_REASON_TEXT: Record<DrawDisabledReason, string> = {
  drawn: 'ドロー済み',
  empty: '山札なし',
  'not-your-turn': '手番ではありません',
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                           */
/* ------------------------------------------------------------------ */

/** True while the user is typing: shortcuts must not fire (§9.5). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
    return true
  }
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Enter submits only when focus is not on something Enter already activates. */
export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.closest('button, a[href], [role="option"], [role="button"], summary') !== null
}

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

/**
 * Window-level shortcuts, ignored while typing or with Ctrl / Meta / Alt held. Keys are
 * `KeyboardEvent.key` values; single letters match case-insensitively.
 */
export function useBoardShortcuts(map: ShortcutMap, enabled = true): void {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) {
        return
      }
      if (isTypingTarget(e.target)) {
        return
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      ref.current[key]?.(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Tone = 'default' | 'primary' | 'factor'

type ActionProps = {
  action: string
  label: string
  icon: ReactNode
  kbd?: string
  showKbd: boolean
  disabled: boolean
  reason?: string | null
  onClick: () => void
  tone?: Tone
  pressed?: boolean
  height: 44 | 55
  /** icon above a small label (portrait bottom bar, where four buttons share 390px) */
  stacked?: boolean
}

const TONE: Record<Tone, string> = {
  default:
    'bg-surface text-ink border-border-strong enabled:hover:bg-raised enabled:hover:shadow-[var(--shadow-2)]',
  primary:
    'bg-prime text-on-prime border-transparent shadow-[var(--shadow-1)] enabled:hover:shadow-[var(--shadow-2)] enabled:hover:brightness-110',
  factor:
    'bg-surface text-factor border-factor enabled:hover:bg-raised aria-pressed:bg-factor aria-pressed:text-on-prime aria-pressed:enabled:hover:bg-factor',
}

function ActionButton({
  action,
  label,
  icon,
  kbd,
  showKbd,
  disabled,
  reason,
  onClick,
  tone = 'default',
  pressed,
  height,
  stacked = false,
}: ActionProps) {
  const reasonId = useId()
  const why = disabled && reason ? reason : null
  const button = (
    <UnstyledButton
      component="button"
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      aria-describedby={why ? reasonId : undefined}
      onClick={onClick}
      data-action={action}
      data-height={height}
      style={{ height, minHeight: height }}
      className={[
        'relative flex w-full items-center justify-center rounded-[var(--r-2)] border',
        stacked ? 'flex-col gap-fib-1 px-fib-1' : 'gap-fib-2 px-fib-3',
        'select-none whitespace-nowrap font-semibold leading-none',
        'transition-[transform,box-shadow,background-color,filter] duration-[var(--t-sm)] ease-[var(--ease-out)]',
        'enabled:active:scale-[0.97] disabled:cursor-not-allowed',
        'disabled:border-line disabled:bg-bg disabled:text-ink-muted disabled:shadow-none',
        stacked
          ? 'text-[length:var(--fs--1)]'
          : height === 55
            ? 'text-[length:var(--fs-1)]'
            : 'text-[length:var(--fs-0)]',
        TONE[tone],
      ].join(' ')}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {icon}
      </span>
      <span>{label}</span>
      {showKbd && kbd && !stacked ? (
        <Kbd
          size="xs"
          aria-hidden="true"
          data-kbd={kbd}
          // full-strength currentColor, thinner border: a 60% opacity hint fell to 2.7–3.7:1
          className="num !border-current/60 !bg-transparent !text-current font-normal"
        >
          {kbd}
        </Kbd>
      ) : null}
      {why ? (
        <span id={reasonId} className="sr-only">
          {why}
        </span>
      ) : null}
    </UnstyledButton>
  )
  if (!why) {
    return button
  }
  return (
    <Tooltip label={why} position="top">
      {/* disabled buttons swallow pointer events: the wrapper carries the tooltip */}
      <span className="flex w-full" data-reason={why}>
        {button}
      </span>
    </Tooltip>
  )
}

/* ------------------------------------------------------------------ */
/* ActionBar                                                           */
/* ------------------------------------------------------------------ */

export function ActionBar({
  canDraw,
  drawReason,
  canPass,
  canSubmit,
  factorMode,
  factorDisabled,
  isMyTurn,
  onDraw,
  onPass,
  onSubmit,
  onToggleFactor,
  orientation,
  showKbd: showKbdProp,
  shortcuts = true,
}: ActionBarProps) {
  const fine = useMediaQuery('(pointer: fine)', false, { getInitialValueInEffect: true })
  const showKbd = showKbdProp ?? fine === true
  const turnReason = isMyTurn ? null : DRAW_REASON_TEXT['not-your-turn']

  useBoardShortcuts(
    {
      d: (e) => {
        if (canDraw) {
          e.preventDefault()
          onDraw()
        }
      },
      p: (e) => {
        if (canPass) {
          e.preventDefault()
          onPass()
        }
      },
      f: (e) => {
        if (!factorDisabled) {
          e.preventDefault()
          onToggleFactor()
        }
      },
      Enter: (e) => {
        if (canSubmit && !isActivatableTarget(e.target)) {
          e.preventDefault()
          onSubmit()
        }
      },
    },
    shortcuts,
  )

  const stacked = orientation === 'bottom'
  const draw = (h: 44 | 55) => (
    <ActionButton
      action="draw"
      label="引く"
      stacked={stacked}
      icon={<IconDrawCard />}
      kbd="D"
      showKbd={showKbd}
      disabled={!canDraw}
      reason={drawReason ? DRAW_REASON_TEXT[drawReason] : turnReason}
      onClick={onDraw}
      height={h}
    />
  )
  const pass = (h: 44 | 55) => (
    <ActionButton
      action="pass"
      label="パス"
      stacked={stacked}
      icon={<IconEmpty />}
      kbd="P"
      showKbd={showKbd}
      disabled={!canPass}
      reason={turnReason}
      onClick={onPass}
      height={h}
    />
  )
  const factor = (h: 44 | 55) => (
    <ActionButton
      action="factor"
      label="素因数分解"
      stacked={stacked}
      icon={<IconTree />}
      kbd="F"
      showKbd={showKbd && orientation !== 'bottom'}
      disabled={factorDisabled}
      reason="カードを選んでください"
      onClick={onToggleFactor}
      tone="factor"
      pressed={factorMode}
      height={h}
    />
  )
  const submit = (
    <ActionButton
      action="submit"
      label="出す"
      stacked={stacked}
      icon={<IconSubmit />}
      kbd="↵"
      showKbd={showKbd}
      disabled={!canSubmit}
      reason={turnReason ?? 'カードを選んでください'}
      onClick={onSubmit}
      tone="primary"
      height={55}
    />
  )

  const common = {
    role: 'group',
    'aria-label': '操作',
    'data-orientation': orientation,
    'data-my-turn': isMyTurn,
  }

  if (orientation === 'rail') {
    return (
      <div {...common} className="flex h-full min-h-0 flex-col gap-fib-2">
        <div className="grid grid-cols-2 gap-fib-2">
          {draw(44)}
          {pass(44)}
        </div>
        {factor(44)}
        <div className="min-h-0 flex-1" aria-hidden="true" />
        {submit}
      </div>
    )
  }

  if (orientation === 'bottom') {
    return (
      <div
        {...common}
        className="grid grid-cols-[1fr_1fr_1.382fr_1.618fr] gap-fib-2 pb-[env(safe-area-inset-bottom)]"
      >
        {draw(55)}
        {pass(55)}
        {factor(55)}
        {submit}
      </div>
    )
  }

  return (
    <div {...common} className="flex items-center gap-fib-2">
      <div className="w-[10.5rem]">{factor(44)}</div>
      <div className="w-[7.5rem]">{pass(44)}</div>
      <div className="w-[10.5rem]">{submit}</div>
    </div>
  )
}
