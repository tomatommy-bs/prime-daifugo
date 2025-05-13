import { PARTYKIT_HOST } from '@/constants/env'
import type { ROOM_STATUS } from '@/constants/status'
import { type CardId, GameCard, isCardId } from '@/game-card/src'
import type { SubmitCardSet } from '@/interface/client-to-server'
import type * as serverToClient from '@/interface/server-to-client'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { concatCardNumbers, concatFactCardIds, isValidFactCardIds } from '@/utils/play-card'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Flex,
  Grid,
  Group,
  Indicator,
  Loader,
  Modal,
  Paper,
  Popover,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAsterisk, IconChevronUp, IconExclamationCircle, IconReload } from '@tabler/icons-react'
import Cookies from 'js-cookie'
import _ from 'lodash'
import usePartySocket from 'partysocket/react'
import ws from 'partysocket/ws'
import { useMemo, useState } from 'react'
import { ClientMessenger } from '../client-messenger'
import { useMessageHandler, useMyField } from '../hooks'
import { WaitingRoom } from './waiting-room'

type Props = {
  id: string
  size?: 'S' | 'M' | 'L'
}

const GameBoard: React.FC<Props> = ({ id, size: compSizeOption = 'M' }) => {
  const [presence, setPresence] = useState<serverToClient.PresenceEvent['presence']>([])
  const [roomStatus, setRoomStatus] = useState<
    (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] | null
  >(null)
  const [gameServerState, setGameServerState] = useState<{
    gameState: PrimeDaifugoGameState
    ctx: Ctx
  } | null>(null)
  const [winner, setWinner] = useState('')
  const [leftTime, setLeftTime] = useState<number | null>(null)

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
        case null: {
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
        case 'BASE_IS_NOT_PRIME':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)}を出しましたが素数ではありません`,
            color: 'red',
          })
          break
        case 'INVALID_FACT':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)} = ${concatFactCardIds(submissionResult.submitCardSet.factor)}を出しましたが素因数分解が成立しません`,
            color: 'red',
          })
          break
        case 'FACT_CONTAIN_NOT_PRIME':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)} = ${concatFactCardIds(submissionResult.submitCardSet.factor)}を出しましたが因数に素数以外のカードが含まれています`,
            color: 'red',
          })
          break
        case 'INCORRECT_ANSWER':
          notifications.show({
            message: `${commander.name}が${concatCardNumbers(submissionResult.submitCardSet.submit)} = ${concatFactCardIds(submissionResult.submitCardSet.factor)}を出しましたが等式が間違っています`,
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
    onEndGame: ({ winner }) => {
      notifications.show({
        message: `${winner}の勝利です 🎉`,
      })
      setWinner(winner)
    },
    onGameEvent: ({ gameState, ctx }) => {
      setGameServerState({ gameState: gameState, ctx })
      const hand = gameState?.players?.[ws.id]?.hand
      setHandCardIds(hand)
    },
    onRoomStatus: ({ status }) => {
      setRoomStatus(status)
    },
    onTimeCount: ({ leftTime: _leftTime }) => {
      if (_leftTime === 0) {
        if (gameServerState?.ctx.currentPlayer === ws.id) {
          notifications.show({ message: '時間切れです', color: 'red' })
          ClientMessenger.pass({ ws })
        }
      } else {
        setLeftTime(_leftTime)
      }
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

  const componentSize = useMemo(() => sizeData[compSizeOption], [compSizeOption])

  const myPresence = presence.find((p) => p.id === ws?.id)

  const handleGameStart = () => {
    ClientMessenger.startGame({ ws })
  }

  const isCommendable = gameServerState?.ctx?.currentPlayer === ws.id
  const playersState = useMemo(() => {
    const enemyIds = Object.keys(gameServerState?.gameState?.players ?? {})
    return enemyIds.map((id) => {
      const name = presence.find((p) => p.id === id)?.name
      const hand = gameServerState?.gameState.players[id]?.hand
      return { id, name, hand, isCommendable: gameServerState?.ctx?.currentPlayer === id }
    })
  }, [gameServerState, presence])

  if (ws.readyState === ws.CONNECTING) {
    return <Loader />
  }

  if (ws.readyState !== ws.OPEN) {
    return (
      <Alert
        variant="filled"
        color="red"
        title={'サーバーへの接続に失敗'}
        icon={<IconExclamationCircle />}
      >
        <Button onClick={() => ws.reconnect()}>再接続</Button>
      </Alert>
    )
  }

  return (
    <>
      {roomStatus === 'waiting' && (
        <WaitingRoom
          presence={presence}
          myPresence={myPresence}
          onGameStart={handleGameStart}
          onSetReady={() => ClientMessenger.setReady({ ws })}
          onUnsetReady={() => ClientMessenger.unsetReady({ ws })}
        />
      )}
      {roomStatus !== 'waiting' && (
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
              <Flex gap={componentSize.p}>
                {playersState.map((enemy) => (
                  <Indicator
                    key={enemy.id}
                    disabled={!enemy.isCommendable}
                    processing={true}
                    size={16}
                    color="green"
                    inline={true}
                    label={leftTime}
                  >
                    <Badge size={'md'} p={componentSize.p}>
                      <Group>
                        <span>{enemy.name}</span>
                        <span>({enemy.hand?.length})</span>
                      </Group>
                    </Badge>
                  </Indicator>
                ))}
              </Flex>
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
                          <Paper
                            p={componentSize.p}
                            miw={200}
                            bg={isCommendable ? 'while' : 'lightgray'}
                          >
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
      <Modal
        opened={roomStatus === 'waitingNextRound'}
        onClose={() => false}
        title={'GAME SET'}
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        centered={true}
      >
        <Stack>
          <Text>{winner}の勝利です🎉</Text>
          <Button onClick={handleGameStart}>次のラウンドを開始</Button>
        </Stack>
      </Modal>
    </>
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

export { GameBoard }
