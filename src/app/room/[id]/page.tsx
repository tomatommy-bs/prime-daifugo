'use client'

import type { ROOM_STATUS } from '@/constants/status'
import { GameCard } from '@/game-card/src'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { concatCardNumbers } from '@/utils/play-card'
import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Indicator,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconReload } from '@tabler/icons-react'
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

  const [compSizeOption, setCompSizeOption] = useLocalStorage<'S' | 'M' | 'L'>({
    key: 'cardSizeOption',
    defaultValue: 'M',
  })
  const componentSize = useMemo(() => sizeData[compSizeOption], [compSizeOption])

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
      <Group p={'xs'} align="center">
        <h1>
          <Badge variant="dot">RoomID: {id}</Badge>
        </h1>
        <SegmentedControl
          size="xs"
          data={['S', 'M', 'L']}
          color="blue"
          value={compSizeOption}
          onChange={(e) => setCompSizeOption(e as 'S' | 'M' | 'L')}
        />
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
        <Stack pb={'md'} gap={componentSize.p}>
          <Grid justify="center">
            <Grid.Col span={{ xs: 4, sm: 3 }}>
              <Paper p={componentSize.p}>
                <Group>
                  <GameCard card={'Back'} fontSize={componentSize.deckCard} /> x{' '}
                  {gameServerState?.gameState?.deck.length}
                  <Button
                    size={componentSize.button}
                    disabled={
                      gameServerState?.gameState?.players[ws.id]?.drawRight === false ||
                      !isCommendable
                    }
                    onClick={() => ClientMessenger.draw({ ws })}
                  >
                    draw
                  </Button>
                </Group>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ xs: 8, sm: 9 }}>
              <SimpleGrid cols={{ xs: 2, sm: 3 }}>
                {enemies.map((enemy) => (
                  <Paper key={enemy.id} p={componentSize.p}>
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
          <Indicator
            mr={16}
            size={32}
            label={`= ${(
              concatCardNumbers(_.nth(gameServerState?.gameState.field, -1) ?? []) || '0'
            ).toString()}`}
          >
            <Paper p={componentSize.p}>
              <SimpleGrid cols={4} mt={'mt'} mih={componentSize.fieldCard}>
                {_.nth(gameServerState?.gameState?.field, -1)?.map((card) => (
                  <GameCard key={card} card={card} fontSize={componentSize.fieldCard} />
                ))}
              </SimpleGrid>
            </Paper>
          </Indicator>
          <Grid align="center">
            <Grid.Col span={'content'}>
              <ActionIcon onClick={reset}>
                <IconReload />
              </ActionIcon>
            </Grid.Col>
            <Grid.Col span={'auto'}>
              <Indicator
                mr={16}
                size={32}
                label={`= ${(concatCardNumbers(submitCardIds) || '0').toString()}`}
              >
                <Paper p={componentSize.p} bg={isCommendable ? 'white' : 'lightgray'}>
                  <SimpleGrid cols={4} mt={'mt'} mih={componentSize.submitCard}>
                    {submitCardIds.map((card) => (
                      <GameCard
                        key={card}
                        card={card}
                        fontSize={componentSize.submitCard}
                        onClick={() => removeSubmitCardId(card)}
                      />
                    ))}
                  </SimpleGrid>
                </Paper>
              </Indicator>
            </Grid.Col>
            <Grid.Col span={'content'}>
              <Stack gap={componentSize.p}>
                <Button
                  size={componentSize.button}
                  disabled={!isCommendable}
                  onClick={() => ClientMessenger.pass({ ws })}
                >
                  pass
                </Button>
                <Button
                  size={componentSize.button}
                  disabled={submitCardIds.length === 0 || !isCommendable}
                  onClick={() => {
                    const fieldTop = _.nth(gameServerState?.gameState.field, -1)
                    if (fieldTop !== undefined) {
                      if (submitCardIds.length !== fieldTop?.length) {
                        notifications.show({ message: '出すカードの枚数が合っていません' })
                        return
                      }
                      if (concatCardNumbers(fieldTop) > concatCardNumbers(submitCardIds)) {
                        notifications.show({
                          message: '場のカードの数より大きくないといけません',
                        })
                        return
                      }
                    }
                    ClientMessenger.submit({ ws, cardIds: submitCardIds })
                  }}
                >
                  submit
                </Button>
              </Stack>
            </Grid.Col>
          </Grid>

          <Paper p={componentSize.p} bg={isCommendable ? 'white' : 'lightgray'}>
            <SimpleGrid cols={{ xs: 12, md: 15 }} mt={'mt'}>
              {handCardIds.map((card) => (
                <GameCard
                  key={card}
                  card={card}
                  fontSize={'5rem'}
                  onClick={() => selectHandCardIdAsSubmit(card)}
                  focusable={isCommendable}
                />
              ))}
            </SimpleGrid>
          </Paper>
        </Stack>
      )}
    </div>
  )
}

const sizeData = {
  S: {
    p: '0.25rem',
    deckCard: '2rem',
    fieldCard: '3rem',
    submitCard: '3rem',
    button: 'xs',
  },
  M: {
    p: '0.5rem',
    deckCard: '3.5rem',
    fieldCard: '4rem',
    submitCard: '4rem',
    button: 'sm',
  },
  L: {
    p: '1.0rem',
    deckCard: '5rem',
    fieldCard: '5rem',
    submitCard: '5rem',
    button: 'md',
  },
} as const satisfies Record<
  'S' | 'M' | 'L',
  { p: string; deckCard: string; fieldCard: string; submitCard: string; button: string }
>

export default Page
