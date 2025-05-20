import { type CardId, GameCard, type GameCardProps } from '@/game-card/src'
import { SimpleGrid, type SimpleGridProps } from '@mantine/core'
import { useViewportSize } from '@mantine/hooks'
import type { FC } from 'react'
interface Props extends SimpleGridProps {
  cardIds: CardId[]
  size?: 's' | 'm' | 'l'
  onClickCard?: (cardId: CardId, idx: number) => void
  focusable?: boolean
  gameCardProps?: GameCardProps
}

const PlayingCardLine: FC<Props> = ({ ...props }) => {
  const nCard = props.cardIds.length
  const { width } = useViewportSize()
  const cols = Math.max(width < 800 ? 10 : 20, nCard)

  return (
    <SimpleGrid className={`pr-8 overflow-scroll ${props.className}`} cols={cols} {...props}>
      {props.cardIds.map((card, idx) => (
        <GameCard
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          key={`${card}-${idx}`}
          className=""
          card={card}
          fontSize={'5rem'}
          onClick={() => props.onClickCard?.(card, idx)}
          focusable={props.focusable}
          {...props.gameCardProps}
        />
      ))}
    </SimpleGrid>
  )
}

export { PlayingCardLine }
