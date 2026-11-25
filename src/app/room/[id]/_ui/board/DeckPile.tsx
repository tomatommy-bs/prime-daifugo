'use client'
/**
 * The deck (spec §6.3, §7.5; catalogue §9.2 #11, #24).
 *
 * Up to three offset backs and a rolling count. The stack carries `data-anchor="deck"` so
 * flights (draws, penalties, flow sweeps) can start or end there. When drawing is not
 * possible the reason is given as a tooltip and as the button's accessible description:
 * ドロー済み / 山札なし / 手番ではありません.
 */
import { NumberGlyph } from '@/design/NumberGlyph'
import { IconDrawCard } from '@/design/icons'
import { DUR, SPRING, useMotionMode } from '@/design/motion'
import { GameCard } from '@/game-card/src'
import { Tooltip } from '@mantine/core'
import { m } from 'framer-motion'
import { useId } from 'react'
import type { DrawDisabledReason } from './types'

export type DeckPileProps = {
  count: number
  canDraw: boolean
  disabledReason?: DrawDisabledReason | null
  onDraw?: () => void
  compact?: boolean
}

export const DRAW_REASON_TEXT: Record<DrawDisabledReason, string> = {
  drawn: 'ドロー済み',
  empty: '山札なし',
  'not-your-turn': '手番ではありません',
}

/** The reason shown while drawing is unavailable (an empty deck explains itself). */
export function drawReason(
  canDraw: boolean,
  count: number,
  disabledReason: DrawDisabledReason | null | undefined,
): DrawDisabledReason | null {
  if (canDraw) {
    return null
  }
  return disabledReason ?? (count <= 0 ? 'empty' : null)
}

/** Offsets for the visible backs, bottom first: a slightly fanned, hand-squared stack. */
const LAYERS = [
  { x: 0, y: 0, rotate: -3 },
  { x: 2, y: -2, rotate: 1.5 },
  { x: 4, y: -4, rotate: 4 },
] as const

export function DeckPile({
  count,
  canDraw,
  disabledReason = null,
  onDraw,
  compact = false,
}: DeckPileProps) {
  const mode = useMotionMode()
  const full = mode === 'full'
  const reason = drawReason(canDraw, count, disabledReason)
  const reasonText = reason ? DRAW_REASON_TEXT[reason] : null
  const descId = useId()
  const layers = LAYERS.slice(0, Math.min(3, Math.max(0, count)))
  const cardH = compact ? 44 : 'var(--card-tray)'

  const stack = (
    <span
      data-anchor="deck"
      data-count={count}
      aria-hidden="true"
      className="relative inline-flex"
      style={{
        height: cardH,
        width: typeof cardH === 'number' ? cardH * 0.69 + 4 : `calc(${cardH} * 0.69 + 4px)`,
      }}
    >
      {layers.length === 0 ? (
        <span
          data-deck-empty=""
          className="absolute inset-0 flex items-center justify-center rounded-[var(--r-2)]"
          style={{
            border: '1.5px dashed var(--border-strong)',
            color: 'var(--ink-muted)',
            fontSize: 'var(--fs-1)',
          }}
        >
          ∅
        </span>
      ) : (
        layers.map((l, i) => (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed stack positions
            key={i}
            data-deck-back={i}
            className="absolute top-0 left-0 flex"
            initial={false}
            animate={{ x: l.x, y: l.y, rotate: l.rotate }}
            transition={SPRING.soft}
            style={{ filter: i === layers.length - 1 ? 'drop-shadow(var(--shadow-1))' : undefined }}
          >
            <GameCard
              card="Back"
              role="presentation"
              aria-hidden="true"
              focusable="false"
              style={{ fontSize: cardH }}
            />
          </m.span>
        ))
      )}
    </span>
  )

  const countEl = (
    <span className="inline-flex items-baseline gap-[3px]">
      <NumberGlyph value={count} size={compact ? -1 : 0} srLabel={`山札 ${count} 枚`} />
    </span>
  )

  const content = (
    <span
      className={
        compact
          ? 'inline-flex items-center gap-fib-2'
          : 'inline-flex flex-col items-center gap-fib-1'
      }
    >
      {stack}
      {countEl}
    </span>
  )

  if (!onDraw) {
    return (
      <div
        data-deck-pile=""
        data-motion={mode}
        className="inline-flex"
        title={reasonText ?? undefined}
      >
        {content}
      </div>
    )
  }

  const disabled = !canDraw
  return (
    <div data-deck-pile="" data-motion={mode} className="inline-flex flex-col items-center">
      <Tooltip label={reasonText} disabled={!reasonText} withinPortal={true}>
        <m.button
          type="button"
          aria-disabled={disabled ? 'true' : undefined}
          aria-describedby={reasonText ? descId : undefined}
          onClick={() => {
            if (!disabled) {
              onDraw()
            }
          }}
          className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center gap-fib-1 rounded-[var(--r-2)] border-0 bg-transparent p-fib-1 text-ink aria-disabled:cursor-not-allowed"
          style={{ filter: disabled ? 'saturate(.618)' : undefined }}
          whileHover={full && !disabled ? { y: -2 } : undefined}
          whileTap={full && !disabled ? { scale: 0.97 } : undefined}
          transition={SPRING.snap}
        >
          {content}
          <span
            className="inline-flex items-center gap-[3px] rounded-[var(--r-1)] px-fib-2 font-semibold"
            style={{
              fontSize: 'var(--fs--1)',
              minHeight: 24,
              color: disabled ? 'var(--ink-muted)' : 'var(--ink)',
              border: `1px solid ${disabled ? 'var(--line)' : 'var(--border-strong)'}`,
              transition: `color ${DUR.sm}s, border-color ${DUR.sm}s`,
            }}
          >
            <IconDrawCard />
            引く
            <span className="num">+1</span>
          </span>
        </m.button>
      </Tooltip>
      {reasonText ? (
        <span id={descId} className="sr-only">
          {reasonText}
        </span>
      ) : null}
    </div>
  )
}
