'use client'

import type { ROOM_STATUS } from '@/constants/status'
import { GameCard } from '@/game-card/src'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { Button, Group, Paper, SimpleGrid } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import Cookies from 'js-cookie'
import usePartySocket from 'partysocket/react'
import { useState } from 'react'
import { PARTYKIT_HOST } from '../../../constants/env'
import type * as serverToClient from '../../../interface/server-to-client'
import { WaitingRoom } from './_ui/waiting-room'
import { ClientMessenger } from './client-messenger'
import { useMessageHandler } from './hooks'

interface Props {
  params: Record<'id', string>
  searchParams: Record<string, string | string[] | undefined>
}

const Page = ({ params: { id } }: Props) => {
  const [presence, setPresence] = useState<serverToClient.PresenceEvent['presence']>([])
  const [roomStatus, setRoomStatus] = useState<
    (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] | null
  >(null)
  const [gameState, setGameState] = useState<PrimeDaifugoGameState | null>(null)

  const { onMessage } = useMessageHandler({
    onChat: (message, from, _socket) => {
      const senderName = presence.find((p) => p.id === from)?.name
      notifications.show({
        title: senderName ? `${senderName} より` : null,
        message: message,
        position: 'bottom-right',
      })
    },
    onPresence: (presence) => {
      setPresence(presence)
    },
    onStartGame: (gameState) => {
      setGameState(gameState)
    },
    onDraw: (gameState) => {
      setGameState(gameState)
    },
    onPass: (gameState) => {
      setGameState(gameState)
    },
    onRoomStatus: (status) => {
      setRoomStatus(status)
    },
  })

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: 'room',
    room: id,
    onMessage: (e) => {
      onMessage(e.data, ws)
    },
    onOpen: () => {
      ClientMessenger.sendName({ ws, name: Cookies.get('name') ?? 'unknown' })
    },
  })

  const myPresence = presence.find((p) => p.id === ws?.id)

  const handleGameStart = () => {
    ClientMessenger.startGame({ ws })
  }

  return (
    <div>
      <h1>Room {id}</h1>
      <WaitingRoom
        presence={presence}
        myPresence={myPresence}
        onGameStart={handleGameStart}
        onSetReady={() => ClientMessenger.setReady({ ws })}
        onUnsetReady={() => ClientMessenger.unsetReady({ ws })}
      />
      {roomStatus}
      <Button onClick={() => ClientMessenger.draw({ ws })}>draw</Button>

      <Group justify="center">
        <Paper p={'md'}>
          <Group>
            <GameCard card={'Back'} fontSize={'5rem'} /> x {gameState?.deck.length}
          </Group>
        </Paper>
      </Group>
      <Paper mt={'md'} p={'md'}>
        <SimpleGrid cols={13} mt={'mt'}>
          {gameState?.players['0'].hand?.map((card) => (
            <GameCard key={card} card={card} fontSize={'5rem'} />
          ))}
        </SimpleGrid>
      </Paper>
    </div>
  )
}

export default Page
