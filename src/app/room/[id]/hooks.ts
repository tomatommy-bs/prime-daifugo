import type { ROOM_STATUS } from '@/constants/status'
import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { compareCard, extractCardIdsFromFactCardIds } from '@/utils/play-card'
import { useSetState } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import _ from 'lodash'
import * as serverToClient from '../../../interface/server-to-client'

type GameEventParams = {
  gameState: PrimeDaifugoGameState
  ctx: Ctx
  commander: {
    id: string
    name: string
  }
}

type RoomEventHandlers = {
  onChat?: (params: { message: string; from: string }) => void
  onPresence?: (params: { presence: serverToClient.PresenceEvent['presence'] }) => void
  onStartGame?: (params: { gameState: PrimeDaifugoGameState; ctx: Ctx }) => void
  onGameEvent?: (params: GameEventParams) => void
  onDraw?: (params: GameEventParams) => void
  onPass?: (params: GameEventParams) => void
  onSubmit?: (
    params: GameEventParams & {
      submissionResult: serverToClient.SubmissionResult
    },
  ) => void
  onEndGame?: (
    params: GameEventParams & {
      winner: string
    },
  ) => void
  onSyncGameState?: (params: Omit<GameEventParams, 'commander'>) => void
  onRoomStatus?: (params: { status: (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] }) => void
  onTimeCount?: (params: { leftTime: number }) => void
}

export const useMessageHandler = (props: RoomEventHandlers) => {
  const onMessage = (payload: string) => {
    const data = serverToClient.serverToClientSchema.parse(JSON.parse(payload))

    switch (data.event) {
      case 'chat':
        props.onChat?.({
          message: data.message,
          from: data.from,
        })
        break
      case 'presence':
        props.onPresence?.(data)
        break
      case 'system': {
        if (data.action !== 'sync') {
          props.onGameEvent?.(data)
        }
        switch (data.action) {
          case 'game-start':
            break
          case 'draw':
            props.onDraw?.(data)
            break
          case 'pass':
            props.onPass?.(data)
            break
          case 'submit':
            props.onSubmit?.(data)
            break
          case 'game-end':
            props.onEndGame?.(data)
            break
          case 'sync':
            props.onSyncGameState?.(data)
            break
          default:
            throw new Error(data satisfies never)
        }
        break
      }
      case 'room-status':
        props.onRoomStatus?.(data)
        break
      case 'left-time':
        props.onTimeCount?.(data)
        break
      default:
        throw new Error(data satisfies never)
    }
  }

  return { onMessage }
}

export const useMyField = (args: { all: CardId[]; field: CardId[][] }) => {
  const { all } = args

  const [state, setState] = useSetState<{
    handCardIds: CardId[]
    submitCardIds: CardId[]
    factCardIds: FactCardId[]
    mode: 'basic' | 'factorization'
  }>({
    handCardIds: all,
    submitCardIds: [],
    factCardIds: [],
    mode: 'basic',
  })

  const selectHandCardIdAsSubmit = (card: CardId) => {
    if (state.submitCardIds.length >= 4) {
      notifications.show({ message: '1度に出せるカードは4枚までです' })
      return
    }

    setState({
      handCardIds: state.handCardIds.filter((c) => c !== card),
      submitCardIds: [...state.submitCardIds, card],
    })
  }

  const selectHandCardIdAsFact = (card: FactCardId) => {
    setState({
      handCardIds: state.handCardIds.filter((c) => c !== card),
      factCardIds: [...state.factCardIds, card],
    })
  }

  const removeSubmitCardId = (card: CardId) => {
    const submitCardIds = state.submitCardIds.filter((c) => c !== card)
    const sortedHandCardIds = [...state.handCardIds, card].sort(compareCard)
    setState({
      handCardIds: sortedHandCardIds,
      submitCardIds: submitCardIds,
    })
  }

  const removeFactCard = (index: number) => {
    const factCardIds = [...state.factCardIds]
    const removedCard = _.nth(factCardIds, index)
    if (removedCard === undefined) {
      return
    }

    factCardIds.splice(index, 1)
    const handCardIds = [
      ...state.handCardIds,
      ...extractCardIdsFromFactCardIds([removedCard]),
    ].sort(compareCard)
    setState({ factCardIds, handCardIds })
  }

  const reset = () => {
    const sortedHandCardIds = [
      ...state.handCardIds,
      ...state.submitCardIds,
      ...extractCardIdsFromFactCardIds(state.factCardIds),
    ].sort(compareCard)
    setState({
      handCardIds: sortedHandCardIds,
      submitCardIds: [],
      factCardIds: [],
      mode: 'basic',
    })
  }

  const setHandCardIds = (handCardIds: CardId[]) => {
    const sortedHandCardIds = handCardIds.sort(compareCard)
    setState({ handCardIds: sortedHandCardIds, submitCardIds: [], factCardIds: [], mode: 'basic' })
  }

  const toggleMode = () => {
    switch (state.mode) {
      case 'basic': {
        setState({ mode: 'factorization' })
        break
      }
      case 'factorization': {
        const newHandCardIds = [
          ...state.handCardIds,
          ...extractCardIdsFromFactCardIds(state.factCardIds),
        ].sort(compareCard)
        setState({ handCardIds: newHandCardIds, factCardIds: [], mode: 'basic' })
        break
      }
      default:
        throw new Error(state.mode satisfies never)
    }
  }

  return {
    handCardIds: state.handCardIds,
    submitCardIds: state.submitCardIds,
    factCardIds: state.factCardIds,
    isFactorizationMode: state.mode === 'factorization',
    selectHandCardIdAsSubmit,
    selectHandCardIdAsFact,
    removeSubmitCardId,
    removeFactCard,
    reset,
    setHandCardIds,
    toggleMode,
  }
}
