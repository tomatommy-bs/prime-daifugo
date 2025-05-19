import { type CardId, GameCard } from '@/game-card/src'
import { SimpleGrid, type SimpleGridProps } from '@mantine/core'
import type { FC } from 'react'

interface Props extends SimpleGridProps {
  cardIds: CardId[]
  size?: 's' | 'm' | 'l'
  onClickCard?: (cardId: CardId, idx: number) => void
  focusable?: boolean
}

const PlayingCardLine: FC<Props> = (props) => {
  return (
    <SimpleGrid cols={{ xs: 12, md: 15 }} className="justify-items-center">
      {props.cardIds.map((card, idx) => (
        <GameCard
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          key={`${card}-${idx}`}
          card={card}
          fontSize={'5rem'}
          onClick={() => props.onClickCard?.(card, idx)}
          focusable={props.focusable}
        />
      ))}
    </SimpleGrid>
  )
}

export { PlayingCardLine }
