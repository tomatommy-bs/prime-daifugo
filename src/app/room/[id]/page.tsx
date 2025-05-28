'use client'
import {} from '@/utils/play-card'
import { Badge, Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { type ReactNode, useState } from 'react'
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
  const [logs, setLogs] = useState<ReactNode[]>([`ここにログが表示されます. RoomID: ${id}`])

  return (
    <div className="py-2">
      <Group p={'xs'} align="center">
        <h1>
          <Badge variant="dot">RoomID: {id}</Badge>
        </h1>
        <QRButton url={window.location.href} popoverProps={{ defaultOpened: true }} />

        <SegmentedControl
          size="xs"
          data={['S', 'M', 'L']}
          color="blue"
          value={compSizeOption}
          onChange={(e) => setCompSizeOption(e as 'S' | 'M' | 'L')}
        />
      </Group>

      <GameBoard
        id={id}
        size={compSizeOption}
        onLogNotification={(logMsg) => setLogs((prev) => [logMsg, ...prev])}
      />
      <Stack className="bg-gray-500/20 p-2 rounded mt-2 gap-0 resize-y overflow-y-scroll">
        {logs.map((log, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <Text key={`${log}-${index}`} size="xs" c="lightgray">
            {log}
          </Text>
        ))}
      </Stack>
    </div>
  )
}

export default Page
