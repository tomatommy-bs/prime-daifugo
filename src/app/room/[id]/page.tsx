'use client'

import usePartySocket from 'partysocket/react'
import { PARTYKIT_HOST } from '../../../constants/env'
import { Affix, Avatar, Button, Group, Paper, SimpleGrid, Stack, TextInput } from '@mantine/core'
import { Fragment, useRef, useState } from 'react'
import { useListState } from '@mantine/hooks'
import { useMessageHandler } from './hooks'
import { ClientMessenger } from './client-messenger'
import * as serverToClient from '../../../interface/server-to-client'
import Cookies from 'js-cookie'
import { notifications } from '@mantine/notifications'
import { WaitingRoom } from './_ui/waiting-room'
import { ROOM_STATUS } from '@/constants/status'

interface Props {
  params: Record<'id', string>
  searchParams: Record<string, string | string[] | undefined>
}

const Page = ({ params: { id } }: Props) => {
  const [presence, setPresence] = useState<serverToClient.PresenceEvent['presence']>([])
  const [roomStatus, setRoomStatus] = useState<
    (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] | null
  >(null)

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
    onStartGame: () => {},
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
    </div>
  )
}

export default Page
