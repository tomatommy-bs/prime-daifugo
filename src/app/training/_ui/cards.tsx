'use client'

import { type CardId, GameCard, MathCard, cardLabel } from '@/game-card/src'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Hand card height. The `22vw` cap keeps five cards a row on a 375px phone (it only binds on
 * narrow screens), so a 7–11 card hand takes two or three rows instead of three or four.
 */
export const HAND_CARD = 'clamp(60px, min(15dvh, 22vw), 104px)'
/** Cards in the answer tray (kept short on phones, where the trays stack). */
export const TRAY_CARD = 'clamp(44px, min(11dvh, 16vw), 80px)'

/** Static cards (no layout flight), for the field, examples and explanations. */
export function CardRow({
  cards,
  height = '2.5rem',
  label,
  className = '',
}: {
  cards: readonly CardId[]
  height?: string
  label?: string
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={label ?? cards.map(cardLabel).join('、')}
      className={`inline-flex shrink-0 gap-1 ${className}`}
    >
      {cards.map((card) => (
        <GameCard
          key={card}
          card={card}
          role="presentation"
          aria-hidden={true}
          fontSize={height}
          className="rounded-[var(--r-1)] shadow-[var(--shadow-1)]"
        />
      ))}
    </span>
  )
}

/**
 * The hand as a wrapping listbox. A used card stays in place, dimmed, so positions never jump;
 * activating it again takes it back.
 */
export function HandPicker({
  cards,
  used,
  disabled,
  onToggle,
  label = '手札',
}: {
  cards: readonly CardId[]
  used: ReadonlySet<CardId>
  disabled: boolean
  onToggle: (card: CardId) => void
  label?: string
}) {
  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: a card listbox, not a <select>
      role="listbox"
      tabIndex={-1}
      aria-label={label}
      aria-multiselectable={true}
      className="flex flex-wrap justify-center gap-fib-2 portrait-phone:gap-fib-1"
      data-hand=""
    >
      {cards.map((card) => (
        <MathCard
          key={card}
          card={card}
          size={HAND_CARD}
          layoutId={`hand-${card}`}
          showValue={true}
          // not the 'disabled' state: a used card must stay activatable to take it back
          aria-selected={used.has(card)}
          onActivate={disabled ? undefined : (c) => c !== 'Back' && onToggle(c)}
          style={used.has(card) ? { opacity: 0.382, filter: 'saturate(.618)' } : undefined}
        />
      ))}
    </div>
  )
}

/** A labelled answer slot (tray) that lists its cards and removes one when tapped. */
export function Tray({
  label,
  active = false,
  children,
  empty,
  readout,
}: {
  label: string
  /** cards go here next (composite play has two trays) */
  active?: boolean
  children: ReactNode
  empty: boolean
  /** e.g. the number the tray spells */
  readout?: ReactNode
}) {
  const ring = active ? 'border-ink' : 'border-line'
  return (
    <section
      aria-label={label}
      data-active={active ? 'true' : undefined}
      className={`flex min-w-0 flex-col gap-fib-2 rounded-[var(--r-2)] border-2 border-dashed ${ring} p-fib-2 transition-colors duration-[var(--t-sm)]`}
    >
      <div className="flex items-baseline gap-fib-2">
        <span className="text-[length:var(--fs--1)] font-bold text-ink-muted">{label}</span>
        <span className="ml-auto min-w-0">{readout}</span>
      </div>
      <div
        className="flex min-h-[var(--tray-h)] flex-wrap items-center gap-1"
        style={{ '--tray-h': TRAY_CARD } as CSSProperties}
      >
        {empty ? (
          <span className="text-[length:var(--fs--1)] text-ink-muted">ここに並びます</span>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/** A card in a tray: tap to send it back to the hand. */
export function TrayCard({
  card,
  onRemove,
  disabled,
}: { card: CardId; onRemove: () => void; disabled: boolean }) {
  return (
    <MathCard
      card={card}
      size={TRAY_CARD}
      layoutId={`tray-${card}`}
      aria-label={`${cardLabel(card)}（タップで戻す）`}
      onActivate={disabled ? undefined : onRemove}
    />
  )
}

const SUIT_MARK = { S: '♠', H: '♥', C: '♣', D: '♦' } as const

/**
 * Cards as small rank-and-suit chips (`10♦ 3♠`): legible at list size, where a card face
 * would be a blur. Shows how a number is spelled (13 is K, or A then 3).
 */
export function RankChips({
  cards,
  className = '',
}: { cards: readonly CardId[]; className?: string }) {
  return (
    <span
      role="img"
      aria-label={cards.map(cardLabel).join('、')}
      className={`inline-flex shrink-0 gap-0.5 ${className}`}
    >
      {cards.map((card) => {
        const suit = card.slice(-1) as keyof typeof SUIT_MARK
        const red = suit === 'H' || suit === 'D'
        return (
          <span
            key={card}
            aria-hidden="true"
            data-chip={card}
            className={`num rounded-[var(--r-1)] border border-line bg-[var(--card-face)] px-1 text-[length:var(--fs--1)] leading-[1.618] ${red ? 'text-[#c8102e]' : 'text-[#16181d]'}`}
          >
            {card.slice(0, -1)}
            {SUIT_MARK[suit]}
          </span>
        )
      })}
    </span>
  )
}

/** True when a hotkey fired while a card had focus (Enter there activates the card instead). */
export const fromCard = (e: KeyboardEvent): boolean =>
  e.target instanceof HTMLElement && e.target.getAttribute('role') === 'option'
