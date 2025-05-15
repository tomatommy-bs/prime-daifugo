'use client'
import {} from '@/utils/play-card'
import { Badge, Group, SegmentedControl } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import {} from '@tabler/icons-react'
import { usePathname } from 'next/navigation'
import { QRButton } from './_ui/QRButton'
import { GameBoard } from './_ui/game-board'
import {} from './hooks'

interface Props {
  params: Record<'id', string>
  searchParams: Record<string, string | string[] | undefined>
}

const Page = ({ params: { id } }: Props) => {
  const [compSizeOption, setCompSizeOption] = useLocalStorage<'S' | 'M' | 'L'>({
    key: 'cardSizeOption',
    defaultValue: 'M',
  })
  const pathname = usePathname()

  return (
    <div>
      <Group p={'xs'} align="center">
        <h1>
          <Badge variant="dot">RoomID: {id}</Badge>
        </h1>
        <QRButton url={pathname} popoverProps={{ defaultOpened: true }} />

        <SegmentedControl
          size="xs"
          data={['S', 'M', 'L']}
          color="blue"
          value={compSizeOption}
          onChange={(e) => setCompSizeOption(e as 'S' | 'M' | 'L')}
        />
      </Group>

      <GameBoard id={id} />
    </div>
  )
}

export default Page
