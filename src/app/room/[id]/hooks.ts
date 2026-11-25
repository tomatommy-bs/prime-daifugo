/**
 * Room-page hooks. `useMyField` is the local tray model (hand / submit tray / factor tokens);
 * server data comes from `useRoomSession` (spec §9), not from here.
 */
import { GAME_CONFIG } from '@/constants/config'
import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { compareCard, extractCardIdsFromFactCardIds } from '@/utils/play-card'
import { useSetState } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import _ from 'lodash'

export const useMyField = (args: {
  all: CardId[]
  field: CardId[][]
  maxSubmitNumberCards?: number
}) => {
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
    if (
      state.submitCardIds.length >= (args.maxSubmitNumberCards ?? GAME_CONFIG.maxSubmitNumCards)
    ) {
      notifications.show({
        message: `1度に出せるカードは${args.maxSubmitNumberCards ?? GAME_CONFIG.maxSubmitNumCards}枚までです`,
      })
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
    // copy: the caller's array (session state) must not be sorted in place
    const sortedHandCardIds = [...handCardIds].sort(compareCard)
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
