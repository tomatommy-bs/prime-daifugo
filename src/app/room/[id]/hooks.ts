import type { ROOM_STATUS } from '@/constants/status'
import type { CardId } from '@/game-card/src'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import { useSetState } from '@mantine/hooks'
import type PartySocket from 'partysocket'
import * as serverToClient from '../../../interface/server-to-client'

interface UseMessageHandlerProps {
  onChat?: (message: string, from: string, socket: PartySocket) => void
  onPresence?: (presence: serverToClient.PresenceEvent['presence']) => void
  onStartGame?: (gameState: PrimeDaifugoGameState, ctx: Ctx) => void
  onGameEvent?: (gameState: PrimeDaifugoGameState, ctx: Ctx) => void
  onDraw?: (gameState: PrimeDaifugoGameState, ctx: Ctx) => void
  onPass?: (gameState: PrimeDaifugoGameState, ctx: Ctx) => void
  onSubmit?: (gameState: PrimeDaifugoGameState, ctx: Ctx) => void
  onRoomStatus?: (status: (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]) => void
}

export const useMessageHandler = (props: UseMessageHandlerProps) => {
  const onMessage = (payload: string, socket: PartySocket) => {
    const data = serverToClient.serverToClientSchema.parse(JSON.parse(payload))

    switch (data.event) {
      case 'chat':
        props.onChat?.(data.message, data.from, socket)
        break
      case 'presence':
        props.onPresence?.(data.presence)
        break
      case 'system': {
        props.onGameEvent?.(data.gameState, data.ctx)
        switch (data.action) {
          case 'game-start':
            break
          case 'draw':
            props.onDraw?.(data.gameState, data.ctx)
            break
          case 'pass':
            props.onPass?.(data.gameState, data.ctx)
            break
          case "submit":
            props.onSubmit?.(data.gameState, data.ctx)
            break
          default:
            throw new Error(data.action satisfies never)
        }
        break
      }
      case 'room-status':
        props.onRoomStatus?.(data.status)
        break
      default:
        throw new Error(data satisfies never)
    }
  }

  return { onMessage }
}

export const useMyField = (args: { all: CardId[] }) => {
  const { all } = args

  const [state, setState] = useSetState<{
    handCardIds: CardId[]
    submitCardIds: CardId[]
  }>({
    handCardIds: all,
    submitCardIds: [],
  })

  const selectHandCardIdAsSubmit = (card: CardId) => {
    setState({
      handCardIds: state.handCardIds.filter((c) => c !== card),
      submitCardIds: [...state.submitCardIds, card],
    })
  }
  const removeSubmitCardId = (card: CardId) => {
    const submitCardIds = state.submitCardIds.filter((c) => c !== card)
    const sortedHandCardIds = [...state.handCardIds, card].sort()
    setState({
      handCardIds: sortedHandCardIds,
      submitCardIds: submitCardIds,
    })
  }

  const reset = () => {
    const sortedHandCardIds = [...state.handCardIds, ...state.submitCardIds].sort()
    setState({
      handCardIds: sortedHandCardIds,
      submitCardIds: [],
    })
  }

  const setHandCardIds = (handCardIds: CardId[]) => {
    const sortedHandCardIds = handCardIds.sort()
    setState({ handCardIds: sortedHandCardIds, submitCardIds: [] })
  }

  return {
    handCardIds: state.handCardIds,
    submitCardIds: state.submitCardIds,
    selectHandCardIdAsSubmit,
    removeSubmitCardId,
    reset,
    setHandCardIds,
  }
}
