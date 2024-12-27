'use client'

import type { ROOM_STATUS } from '@/constants/status'
import { GameCard } from '@/game-card/src'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { concatCardNumbers } from '@/utils/play-card'
import {
  Badge,
  Button,
  Grid,
  Group,
  InputLabel,
  InputWrapper,
  Paper,
  PinInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
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
  } = useMyField({ all: [], field: gameServerState?.gameState.field ?? [] })

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

  const [cardSizeOption, setCardSizeOption] = useLocalStorage<'S' | 'M' | 'L'>({
    key: 'cardSizeOption',
    defaultValue: 'M',
  })
  const cardSize = useMemo(() => {
    switch (cardSizeOption) {
      case 'S':
        return {
          p: '0.25rem',
          deckCard: '2rem',
          fieldCard: '3rem',
          submitCard: '3rem',
        }
      case 'M':
        return {
          p: '0.5rem',
          deckCard: '3.5rem',
          fieldCard: '4rem',
          submitCard: '4rem',
        }
      case 'L':
        return {
          p: '1.0rem',
          deckCard: '5rem',
          fieldCard: '5rem',
          submitCard: '5rem',
        }
      default:
        throw new Error(cardSizeOption satisfies never)
    }
  }, [cardSizeOption])

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

  console.log(submitCardIds)
  console.log(concatCardNumbers(submitCardIds))
  console.log(concatCardNumbers(submitCardIds) || '')
  console.log((concatCardNumbers(submitCardIds) || '').toString())

  return (
    <div>
      <Group p={'xs'} align="center">
        <h1>
          <Badge variant="dot">RoomID: {id}</Badge>
        </h1>
        <InputWrapper>
          <InputLabel mr={'md'}>
            <Badge>Card Size</Badge>
          </InputLabel>
          <SegmentedControl
            size="xs"
            data={['S', 'M', 'L']}
            color="blue"
            value={cardSizeOption}
            onChange={(e) => setCardSizeOption(e as 'S' | 'M' | 'L')}
          />
        </InputWrapper>
      </Group>
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
        <Stack pb={'md'} gap={cardSize.p}>
          <Grid justify="center">
            <Grid.Col span={{ xs: 4, sm: 3 }}>
              <Paper p={cardSize.p}>
                <Group>
                  <GameCard card={'Back'} fontSize={cardSize.deckCard} /> x{' '}
                  {gameServerState?.gameState?.deck.length}
                </Group>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ xs: 8, sm: 9 }}>
              <SimpleGrid cols={{ xs: 2, sm: 3 }}>
                {enemies.map((enemy) => (
                  <Paper key={enemy.id} p={cardSize.p}>
                    <Group>
                      <span>{enemy.name}</span>
                      <span>
                        <GameCard card="Back" fontSize={'2rem'} />
                      </span>
                      <span>x {enemy.hand?.length}</span>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Grid.Col>
          </Grid>
          <Button.Group className={'justify-center'}>
            <Button onClick={reset}>reset</Button>
            <Button.GroupSection bg={'transparent'} />
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
              onClick={() => {
                const fieldTop = _.nth(gameServerState?.gameState.field, -1)
                if (fieldTop !== undefined) {
                  if (submitCardIds.length !== fieldTop?.length) {
                    notifications.show({ message: '出すカードの枚数が合っていません' })
                    return
                  }
                  if (concatCardNumbers(fieldTop) > concatCardNumbers(submitCardIds)) {
                    notifications.show({ message: '場のカードの数より大きくないといけません' })
                    return
                  }
                }
                ClientMessenger.submit({ ws, cardIds: submitCardIds })
              }}
            >
              submit
            </Button>
          </Button.Group>
          <Grid align="center">
            <Grid.Col span={5}>
              <Paper p={cardSize.p}>
                <SimpleGrid cols={4} mt={'mt'} mih={cardSize.fieldCard}>
                  {_.nth(gameServerState?.gameState?.field, -1)?.map((card) => (
                    <GameCard key={card} card={card} fontSize={cardSize.fieldCard} />
                  ))}
                </SimpleGrid>
              </Paper>
            </Grid.Col>
            <Grid.Col span={1}>
              <Badge size="xl" variant="white">
                =
              </Badge>
            </Grid.Col>
            <Grid.Col span={6}>
              <PinInput
                readOnly={true}
                placeholder={''}
                length={8}
                value={(
                  concatCardNumbers(_.nth(gameServerState?.gameState.field, -1) ?? []) || ''
                ).toString()}
              />
            </Grid.Col>
          </Grid>
          <Grid align="center">
            <Grid.Col span={5}>
              <Paper p={cardSize.p} bg={isCommendable ? 'default' : 'lightgray'}>
                <SimpleGrid cols={4} mt={'mt'} mih={cardSize.submitCard}>
                  {submitCardIds.map((card) => (
                    <GameCard
                      key={card}
                      card={card}
                      fontSize={cardSize.submitCard}
                      onClick={() => removeSubmitCardId(card)}
                    />
                  ))}
                </SimpleGrid>
              </Paper>
            </Grid.Col>
            <Grid.Col span={1}>
              <Badge size="xl" variant="white">
                =
              </Badge>
            </Grid.Col>
            <Grid.Col span={6}>
              <PinInput
                readOnly={true}
                placeholder={''}
                length={8}
                value={(concatCardNumbers(submitCardIds) || '').toString()}
              />
            </Grid.Col>
          </Grid>
          <Paper p={cardSize.p}>
            <SimpleGrid cols={{ xs: 12, md: 15 }} mt={'mt'}>
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
        </Stack>
      )}
    </div>
  )
}

export default Page
