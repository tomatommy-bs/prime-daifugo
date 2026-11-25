'use client'

import { useLayoutMode } from '@/design/use-layout-mode'
import { type CardId, type GameCardProps, MathCard } from '@/game-card/src'
import { SimpleGrid, type SimpleGridProps } from '@mantine/core'
import type { FC } from 'react'

interface Props extends SimpleGridProps {
  cardIds: CardId[]
  size?: 's' | 'm' | 'l'
  onClickCard?: (cardId: CardId, idx: number) => void
  focusable?: boolean
  gameCardProps?: Omit<GameCardProps, 'card'>
}

/** Card heights for the S/M/L option: a geometric series with r = 1.25 (spec §4). */
const SIZE_HEIGHT: Record<NonNullable<Props['size']>, string> = {
  s: '4rem',
  m: '5rem',
  l: '6.25rem',
}

/**
 * A grid of cards. Compact and portrait layouts use at least 10 columns, the others 20
 * (or one per card, whichever is larger); an explicit `cols` prop wins.
 */
const PlayingCardLine: FC<Props> = ({
  cardIds,
  size = 'm',
  onClickCard,
  focusable,
  gameCardProps,
  cols,
  className,
  ...gridProps
}) => {
  const mode = useLayoutMode()
  const minCols = mode === 'compact' || mode === 'portrait' ? 10 : 20
  const resolvedCols = cols ?? Math.max(minCols, cardIds.length)
  const { fontSize, role: _role, ref: _ref, ...cardProps } = gameCardProps ?? {}
  const height =
    fontSize === undefined
      ? SIZE_HEIGHT[size]
      : typeof fontSize === 'number'
        ? `${fontSize}px`
        : fontSize
  // A card id that appears twice cannot share one layout id.
  const unique = new Set(cardIds).size === cardIds.length

  return (
    <SimpleGrid
      // biome-ignore lint/a11y/useSemanticElements: a card listbox, not a <select>
      role="listbox"
      aria-orientation="horizontal"
      {...gridProps}
      cols={resolvedCols}
      className={['overflow-x-auto overflow-y-visible pt-2 pr-8 pb-3', className]
        .filter(Boolean)
        .join(' ')}
    >
      {cardIds.map((card, idx) => (
        <MathCard
          // biome-ignore lint/suspicious/noArrayIndexKey: the same card id may repeat (labo calc)
          key={`${card}-${idx}`}
          card={card}
          size={height}
          role="option"
          aria-selected={false}
          tabIndex={focusable === false ? -1 : onClickCard ? 0 : undefined}
          layoutId={unique ? `card-${card}` : `card-${card}-${idx}`}
          onActivate={onClickCard ? () => onClickCard(card, idx) : undefined}
          cardProps={cardProps}
        />
      ))}
    </SimpleGrid>
  )
}

export { PlayingCardLine }
