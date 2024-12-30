'use client'

import type { ROOM_STATUS } from '@/constants/status'
import { type CardId, GameCard, isCardId } from '@/game-card/src'
import type { SubmitCardSet } from '@/interface/client-to-server'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { concatCardNumbers, concatFactCardIds, isValidFactCardIds } from '@/utils/play-card'
import {
  ActionIcon,
  Badge,
  Button,
  Flex,
  Grid,
  Group,
  Indicator,
  Paper,
  Popover,
  SegmentedControl,
  SimpleGrid,
  Stack,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconAsterisk, IconChevronUp, IconReload } from '@tabler/icons-react'
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
    isFactorizationMode,
    factCardIds,
    selectHandCardIdAsSubmit,
    selectHandCardIdAsFact,
    setHandCardIds,
    removeSubmitCardId,
    removeFactCard,
    toggleMode,
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
    onSubmit: ({ commander, submissionResult }) => {
      switch (submissionResult.result) {
        case 'success': {
          if (submissionResult.submitCardSet.factor.length > 0) {
            notifications.show({
              message: `${commander.name}が${concatCardNumbers(
                submissionResult.submitCardSet.submit,
              )} = ${concatFactCardIds(submissionResult.submitCardSet.factor)}を出しました`,
            })
          } else {
            notifications.show({
              message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)}を出しました`,
            })
          }
          break
        }
        case 'is-not-prime':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)}を出しましたが素数ではありません`,
            color: 'red',
          })
          break
        case 'is-not-valid-factor':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)} = ${concatFactCardIds(submissionResult.submitCardSet.factor)}を出しましたが素因数分解が成立しません`,
            color: 'red',
          })
          break
        default:
          throw new Error(submissionResult.result satisfies never)
      }
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
      return { id, name, hand, isCommendable: gameServerState?.ctx?.currentPlayer === id }
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
                  <Indicator
                    key={enemy.id}
                    disabled={!enemy.isCommendable}
                    processing={true}
                    size={16}
                    color="green"
                  >
                    <Paper p={componentSize.p}>
                      <Group>
                        <span>{enemy.name}</span>
                        <span>
                          <GameCard card="Back" fontSize={'2rem'} />
                        </span>
                        <span>x {enemy.hand?.length}</span>
                      </Group>
                    </Paper>
                  </Indicator>
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
              <Group>
                <Popover
                  position="top-end"
                  withArrow={true}
                  closeOnClickOutside={false}
                  closeOnEscape={false}
                  opened={isFactorizationMode}
                >
                  <Popover.Target>
                    <Button disabled={submitCardIds.length === 0} onClick={toggleMode}>
                      {isFactorizationMode ? 'キャンセル' : '素因数分解'}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown maw={'100vw'}>
                    <Grid align="center">
                      <Grid.Col span={'content'}>
                        <Badge>{concatCardNumbers(submitCardIds) || 0} =</Badge>
                      </Grid.Col>
                      <Grid.Col span={'auto'}>
                        <Stack align="end" gap={'xs'}>
                          <Paper p={componentSize.p} bg={isCommendable ? 'while' : 'lightgray'}>
                            <Flex align={'center'} mih={componentSize.submitCard}>
                              {factCardIds.map((card, idx) =>
                                isCardId(card) ? (
                                  <GameCard
                                    key={card}
                                    card={card}
                                    fontSize={componentSize.submitCard}
                                    onClick={() => removeFactCard(idx)}
                                  />
                                ) : (
                                  <ActionIcon
                                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                                    key={`${card}-${idx}`}
                                    variant="white"
                                    onClick={() => removeFactCard(idx)}
                                  >
                                    {card === '*' ? (
                                      <IconAsterisk size={componentSize.submitCard} />
                                    ) : (
                                      <IconChevronUp size={componentSize.submitCard} />
                                    )}
                                  </ActionIcon>
                                ),
                              )}
                            </Flex>
                          </Paper>
                          <Badge>= {concatFactCardIds(factCardIds)}</Badge>
                        </Stack>
                      </Grid.Col>
                      <Grid.Col span={'content'}>
                        <Stack gap={'xs'}>
                          <ActionIcon>
                            <IconAsterisk onClick={() => selectHandCardIdAsFact('*')} />
                          </ActionIcon>
                          <ActionIcon>
                            <IconChevronUp onClick={() => selectHandCardIdAsFact('^')} />
                          </ActionIcon>
                        </Stack>
                      </Grid.Col>
                    </Grid>
                  </Popover.Dropdown>
                </Popover>
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
                      const errMessage = validateSubmitCardSet(fieldTop, {
                        submit: submitCardIds,
                        factor: factCardIds,
                      })
                      if (errMessage !== null) {
                        notifications.show({ message: errMessage, color: 'red' })
                        return
                      }
                      ClientMessenger.submit({
                        ws,
                        submitCardSet: {
                          submit: submitCardIds,
                          factor: factCardIds,
                        },
                      })
                    }}
                  >
                    submit
                  </Button>
                </Stack>
              </Group>
            </Grid.Col>
          </Grid>

          <Paper p={componentSize.p} bg={isCommendable ? 'white' : 'lightgray'}>
            <SimpleGrid cols={{ xs: 12, md: 15 }} mt={'mt'} className="justify-items-center">
              {handCardIds.map((card) => (
                <GameCard
                  key={card}
                  card={card}
                  fontSize={'5rem'}
                  onClick={() => {
                    isFactorizationMode
                      ? selectHandCardIdAsFact(card)
                      : selectHandCardIdAsSubmit(card)
                  }}
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

const validateSubmitCardSet = (
  fieldTop: CardId[] | undefined,
  submitCardSet: SubmitCardSet,
): string | null => {
  const asFactMode = submitCardSet.factor.length > 0

  if (fieldTop !== undefined) {
    if (concatCardNumbers(fieldTop) > concatCardNumbers(submitCardSet.submit)) {
      return '場のカードの数より大きくないといけません'
    }
    if (submitCardSet.submit.length !== fieldTop.length) {
      return '出すカードの枚数が合っていません'
    }
  }

  if (!asFactMode) {
    if (fieldTop === undefined) {
      return null
    }
    return null
  }
  if (fieldTop === undefined) {
    if (!isValidFactCardIds(submitCardSet.factor)) {
      return '素因数分解として成立していません'
    }
    return null
  }

  return null
}

export default Page
