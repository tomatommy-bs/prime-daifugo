'use client'

import type { ROOM_STATUS } from '@/constants/status'
import { GameCard } from '@/game-card/src'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { concatCardNumbers } from '@/utils/play-card'
import { Button, Group, Paper, SimpleGrid, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import Cookies from 'js-cookie'
import _ from 'lodash'
import usePartySocket from 'partysocket/react'
import { useMemo, useState } from 'react'
import { PARTYKIT_HOST } from '../../../constants/env'
import type * as serverToClient from '../../../interface/server-to-client'
import { WaitingRoom } from './_ui/waiting-room'
import { ClientMessenger } from './client-messenger'
import { useMessageHandler, useMyField } from './hooks'

interface Props {
  params: Record<'id', string>
  searchParams: Record<string, string | string[] | undefined>
}

const Page = ({ params: { id } }: Props) => {
  const [presence, setPresence] = useState<serverToClient.PresenceEvent['presence']>([])
  const [roomStatus, setRoomStatus] = useState<
    (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] | null
  >(null)
  const [gameServerState, setGameServerState] = useState<{
    gameState: PrimeDaifugoGameState
    ctx: Ctx
  } | null>(null)
  const {
    handCardIds,
    submitCardIds,
    selectHandCardIdAsSubmit,
    setHandCardIds,
    removeSubmitCardId,
    reset,
  } = useMyField({ all: [] })

  const { onMessage } = useMessageHandler({
    onChat: ({ message, from }) => {
      const senderName = presence.find((p) => p.id === from)?.name
      notifications.show({
        title: senderName ? `${senderName} より` : null,
        message: message,
      })
    },
    onPresence: ({ presence }) => {
      setPresence(presence)
    },
    onPass: ({ commander }) => {
      notifications.show({ message: `${commander.name}がパスしました` })
    },
    onSubmit: ({ commander }) => {
      notifications.show({ message: `${commander.name}がカードを出しました` })
    },
    onDraw: ({ commander }) => {
      notifications.show({ message: `${commander.name}がドローしました` })
    },
    onGameEvent: ({ gameState, ctx }) => {
      setGameServerState({ gameState: gameState, ctx })
      const hand = gameState?.players?.[ws.id]?.hand
      setHandCardIds(hand)
    },
    onRoomStatus: ({ status }) => {
      setRoomStatus(status)
    },
  })

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: 'room',
    room: id,

    onMessage: (e) => {
      onMessage(e.data)
    },
    onOpen: () => {
      ClientMessenger.sendName({ ws, name: Cookies.get('name') ?? 'unknown' })
    },
  })

  const myPresence = presence.find((p) => p.id === ws?.id)

  const handleGameStart = () => {
    ClientMessenger.startGame({ ws })
  }

  const isCommendable = gameServerState?.ctx?.currentPlayer === ws.id
  const enemies = useMemo(() => {
    const enemyIds = Object.keys(gameServerState?.gameState?.players ?? {}).filter(
      (id) => id !== ws.id,
    )
    return enemyIds.map((id) => {
      const name = presence.find((p) => p.id === id)?.name
      const hand = gameServerState?.gameState.players[id]?.hand
      return { id, name, hand }
    })
  }, [gameServerState, presence, ws.id])

  return (
    <div>
      <h1>Room {id}</h1>
      {roomStatus === 'waiting' && (
        <WaitingRoom
          presence={presence}
          myPresence={myPresence}
          onGameStart={handleGameStart}
          onSetReady={() => ClientMessenger.setReady({ ws })}
          onUnsetReady={() => ClientMessenger.unsetReady({ ws })}
        />
      )}
      {roomStatus === 'playing' && (
        <>
          <Button.Group>
            <Button
              disabled={
                gameServerState?.gameState?.players[ws.id]?.drawRight === false || !isCommendable
              }
              onClick={() => ClientMessenger.draw({ ws })}
            >
              draw
            </Button>
            <Button disabled={!isCommendable} onClick={() => ClientMessenger.pass({ ws })}>
              pass
            </Button>
            <Button
              disabled={submitCardIds.length === 0 || !isCommendable}
              onClick={() => ClientMessenger.submit({ ws, cardIds: submitCardIds })}
            >
              submit
            </Button>
          </Button.Group>

          <Group justify="center">
            <Paper p={'md'}>
              <Group>
                <GameCard card={'Back'} fontSize={'5rem'} /> x{' '}
                {gameServerState?.gameState?.deck.length}
              </Group>
            </Paper>
            <Stack>
              {enemies.map((enemy) => (
                <Paper key={enemy.id} p={'md'}>
                  <Group>
                    <span>{enemy.name}</span>
                    <span>
                      <GameCard card="Back" fontSize={'2rem'} />
                    </span>
                    <span>x {enemy.hand?.length}</span>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Group>
          <Paper mt={'md'} p={'md'}>
            <SimpleGrid cols={13} mt={'mt'}>
              {_.nth(gameServerState?.gameState?.field, -1)?.map((card) => (
                <GameCard key={card} card={card} fontSize={'5rem'} />
              ))}
            </SimpleGrid>
          </Paper>
          <Paper mt={'md'} p={'md'}>
            <SimpleGrid cols={13} mt={'mt'}>
              {submitCardIds.map((card) => (
                <GameCard
                  key={card}
                  card={card}
                  fontSize={'5rem'}
                  onClick={() => removeSubmitCardId(card)}
                />
              ))}
              <span>{concatCardNumbers(submitCardIds) || ''}</span>
            </SimpleGrid>
          </Paper>

          <Paper mt={'md'} p={'md'}>
            <SimpleGrid cols={13} mt={'mt'}>
              {handCardIds.map((card) => (
                <GameCard
                  key={card}
                  card={card}
                  fontSize={'5rem'}
                  onClick={() => selectHandCardIdAsSubmit(card)}
                />
              ))}
            </SimpleGrid>
          </Paper>
          <Button onClick={reset}>reset</Button>
        </>
      )}
    </div>
  )
}

export default Page
