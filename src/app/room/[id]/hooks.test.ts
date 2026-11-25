/**
 * Characterization tests: pin the CURRENT behaviour of hooks.ts before the redesign.
 */
import type { CardId } from '@/game-card/src'
import { makeCtx, makeGameState, makePresence, serverMsg } from '@/test-utils'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageHandler, useMyField } from './hooks'

const showMock = vi.hoisted(() => vi.fn())
vi.mock('@mantine/notifications', () => ({
  notifications: { show: showMock },
}))

const handlerNames = [
  'onChat',
  'onPresence',
  'onStartGame',
  'onChangeRule',
  'onGameEvent',
  'onDraw',
  'onPass',
  'onSubmit',
  'onEndGame',
  'onSyncGameState',
  'onRoomStatus',
  'onTimeCount',
] as const

type HandlerName = (typeof handlerNames)[number]

const setup = () => {
  const calls: HandlerName[] = []
  const handlers = Object.fromEntries(
    handlerNames.map((name) => [name, vi.fn(() => calls.push(name))]),
  ) as Record<HandlerName, ReturnType<typeof vi.fn>>
  const { result } = renderHook(() => useMessageHandler(handlers))
  const send = (payload: unknown) => result.current.onMessage(JSON.stringify(payload))
  return { handlers, calls, send, onMessage: result.current.onMessage }
}

const calledOnly = (handlers: Record<HandlerName, ReturnType<typeof vi.fn>>) =>
  handlerNames.filter((name) => handlers[name].mock.calls.length > 0)

describe('useMessageHandler', () => {
  it('dispatches chat to onChat only', () => {
    const { handlers, send } = setup()
    send(serverMsg.chat('hello', 'p2'))
    expect(calledOnly(handlers)).toEqual(['onChat'])
    expect(handlers.onChat).toHaveBeenCalledWith({ message: 'hello', from: 'p2' })
  })

  it('dispatches presence to onPresence', () => {
    const { handlers, send } = setup()
    const presence = makePresence(['alice', 'bob'])
    send(serverMsg.presence(presence))
    expect(calledOnly(handlers)).toEqual(['onPresence'])
    expect(handlers.onPresence).toHaveBeenCalledWith({ event: 'presence', presence })
  })

  it('dispatches room-status to onRoomStatus', () => {
    const { handlers, send } = setup()
    send(serverMsg.roomStatus('waitingNextRound'))
    expect(calledOnly(handlers)).toEqual(['onRoomStatus'])
    expect(handlers.onRoomStatus.mock.calls[0][0]).toMatchObject({ status: 'waitingNextRound' })
  })

  it('dispatches left-time to onTimeCount', () => {
    const { handlers, send } = setup()
    send(serverMsg.leftTime(42))
    expect(calledOnly(handlers)).toEqual(['onTimeCount'])
    expect(handlers.onTimeCount.mock.calls[0][0]).toMatchObject({ leftTime: 42 })
  })

  it('game-start reaches onGameEvent only (onStartGame is never called)', () => {
    const { handlers, send } = setup()
    send(serverMsg.gameStart())
    expect(calledOnly(handlers)).toEqual(['onGameEvent'])
  })

  it.each([
    ['draw', serverMsg.draw(), 'onDraw'],
    ['pass', serverMsg.pass(), 'onPass'],
    [
      'submit',
      serverMsg.submit({ submitCardSet: { submit: ['2S'], factor: [] }, result: null }),
      'onSubmit',
    ],
    ['game-end', serverMsg.gameEnd({ winner: 'alice' }), 'onEndGame'],
  ] as const)('%s runs onGameEvent first, then %s', (_name, msg, handler) => {
    const { handlers, calls, send } = setup()
    send(msg)
    expect(calls).toEqual(['onGameEvent', handler])
    expect(handlers.onGameEvent.mock.calls[0][0]).toMatchObject({
      gameState: msg.gameState,
      ctx: msg.ctx,
      commander: { id: 'p1', name: 'player1' },
    })
  })

  it('passes submissionResult and winner through', () => {
    const { handlers, send } = setup()
    send(
      serverMsg.submit({
        submitCardSet: { submit: ['2S', '2H'], factor: [] },
        result: 'BASE_IS_NOT_PRIME',
      }),
    )
    expect(handlers.onSubmit.mock.calls[0][0].submissionResult).toEqual({
      submitCardSet: { submit: ['2S', '2H'], factor: [] },
      result: 'BASE_IS_NOT_PRIME',
    })
    send(serverMsg.gameEnd({ winner: 'bob' }))
    expect(handlers.onEndGame.mock.calls[0][0].winner).toBe('bob')
  })

  it('does NOT call onGameEvent on sync', () => {
    const { handlers, send } = setup()
    const gameState = makeGameState()
    const ctx = makeCtx()
    send(serverMsg.sync({ gameState, ctx }))
    expect(calledOnly(handlers)).toEqual(['onSyncGameState'])
    expect(handlers.onSyncGameState.mock.calls[0][0]).toMatchObject({ gameState, ctx })
  })

  it('does NOT call onGameEvent on change-rule', () => {
    const { handlers, send } = setup()
    send(serverMsg.changeRule({ timeLimit: 15 }))
    expect(calledOnly(handlers)).toEqual(['onChangeRule'])
    expect(handlers.onChangeRule).toHaveBeenCalledWith({ rule: { timeLimit: 15 } })
  })

  it('rejects invalid JSON by throwing, without calling any handler', () => {
    const { handlers, onMessage } = setup()
    expect(() => onMessage('{not json')).toThrow()
    expect(calledOnly(handlers)).toEqual([])
  })

  it('rejects schema-invalid payloads by throwing, without calling any handler', () => {
    const { handlers, onMessage } = setup()
    expect(() => onMessage(JSON.stringify({ event: 'nope' }))).toThrow()
    expect(() => onMessage(JSON.stringify({ event: 'left-time', leftTime: 'x' }))).toThrow()
    expect(calledOnly(handlers)).toEqual([])
  })

  it('tolerates missing optional handlers', () => {
    const { result } = renderHook(() => useMessageHandler({}))
    expect(() => result.current.onMessage(JSON.stringify(serverMsg.draw()))).not.toThrow()
    expect(() => result.current.onMessage(JSON.stringify(serverMsg.sync()))).not.toThrow()
  })
})

describe('useMyField', () => {
  beforeEach(() => {
    showMock.mockClear()
  })

  const hand: CardId[] = ['AS', '2H', '3C', '4D', '5S', '6H']

  const setupField = (maxSubmitNumberCards?: number) =>
    renderHook(() => useMyField({ all: [...hand], field: [], maxSubmitNumberCards }))

  it('starts in basic mode with the given hand', () => {
    const { result } = setupField()
    expect(result.current.handCardIds).toEqual(hand)
    expect(result.current.submitCardIds).toEqual([])
    expect(result.current.factCardIds).toEqual([])
    expect(result.current.isFactorizationMode).toBe(false)
  })

  it('select moves a card from hand to tray, in selection order', () => {
    const { result } = setupField()
    act(() => result.current.selectHandCardIdAsSubmit('3C'))
    act(() => result.current.selectHandCardIdAsSubmit('AS'))
    expect(result.current.submitCardIds).toEqual(['3C', 'AS'])
    expect(result.current.handCardIds).toEqual(['2H', '4D', '5S', '6H'])
  })

  it('caps the tray at maxSubmitNumberCards and notifies', () => {
    const { result } = setupField(2)
    act(() => result.current.selectHandCardIdAsSubmit('AS'))
    act(() => result.current.selectHandCardIdAsSubmit('2H'))
    act(() => result.current.selectHandCardIdAsSubmit('3C'))
    expect(result.current.submitCardIds).toEqual(['AS', '2H'])
    expect(result.current.handCardIds).toContain('3C')
    expect(showMock).toHaveBeenCalledWith({ message: '1度に出せるカードは2枚までです' })
  })

  it('defaults the cap to GAME_CONFIG.maxSubmitNumCards (4)', () => {
    const { result } = setupField()
    for (const c of ['AS', '2H', '3C', '4D', '5S'] as CardId[]) {
      act(() => result.current.selectHandCardIdAsSubmit(c))
    }
    expect(result.current.submitCardIds).toHaveLength(4)
    expect(showMock).toHaveBeenCalledWith({ message: '1度に出せるカードは4枚までです' })
  })

  it('remove returns the card to the hand, re-sorted with compareCard', () => {
    const { result } = setupField()
    act(() => result.current.selectHandCardIdAsSubmit('AS'))
    act(() => result.current.selectHandCardIdAsSubmit('5S'))
    act(() => result.current.removeSubmitCardId('AS'))
    expect(result.current.submitCardIds).toEqual(['5S'])
    expect(result.current.handCardIds).toEqual(['AS', '2H', '3C', '4D', '6H'])
  })

  it('fact selection and removeFactCard', () => {
    const { result } = setupField()
    act(() => result.current.toggleMode())
    act(() => result.current.selectHandCardIdAsFact('2H'))
    act(() => result.current.selectHandCardIdAsFact('*'))
    act(() => result.current.selectHandCardIdAsFact('3C'))
    expect(result.current.factCardIds).toEqual(['2H', '*', '3C'])
    expect(result.current.handCardIds).toEqual(['AS', '4D', '5S', '6H'])
    // removing an operator does not add anything to the hand
    act(() => result.current.removeFactCard(1))
    expect(result.current.factCardIds).toEqual(['2H', '3C'])
    expect(result.current.handCardIds).toEqual(['AS', '4D', '5S', '6H'])
    // removing a card returns it, sorted
    act(() => result.current.removeFactCard(0))
    expect(result.current.factCardIds).toEqual(['3C'])
    expect(result.current.handCardIds).toEqual(['AS', '2H', '4D', '5S', '6H'])
    // out of range is a no-op
    act(() => result.current.removeFactCard(9))
    expect(result.current.factCardIds).toEqual(['3C'])
  })

  it('reset returns tray and fact cards to the sorted hand and leaves factor mode', () => {
    const { result } = setupField()
    act(() => result.current.selectHandCardIdAsSubmit('6H'))
    act(() => result.current.toggleMode())
    act(() => result.current.selectHandCardIdAsFact('2H'))
    act(() => result.current.selectHandCardIdAsFact('^'))
    act(() => result.current.reset())
    expect(result.current.handCardIds).toEqual(hand)
    expect(result.current.submitCardIds).toEqual([])
    expect(result.current.factCardIds).toEqual([])
    expect(result.current.isFactorizationMode).toBe(false)
  })

  it('setHandCardIds sorts the new hand and clears both trays and the mode', () => {
    const { result } = setupField()
    act(() => result.current.selectHandCardIdAsSubmit('AS'))
    act(() => result.current.toggleMode())
    act(() => result.current.selectHandCardIdAsFact('2H'))
    act(() => result.current.setHandCardIds(['KS', '2C', 'AH', '2S']))
    expect(result.current.handCardIds).toEqual(['AH', '2S', '2C', 'KS'])
    expect(result.current.submitCardIds).toEqual([])
    expect(result.current.factCardIds).toEqual([])
    expect(result.current.isFactorizationMode).toBe(false)
  })

  it('toggleMode enters factor mode, and leaving returns the fact cards (tray kept)', () => {
    const { result } = setupField()
    act(() => result.current.selectHandCardIdAsSubmit('AS'))
    act(() => result.current.toggleMode())
    expect(result.current.isFactorizationMode).toBe(true)
    act(() => result.current.selectHandCardIdAsFact('5S'))
    act(() => result.current.selectHandCardIdAsFact('*'))
    act(() => result.current.toggleMode())
    expect(result.current.isFactorizationMode).toBe(false)
    expect(result.current.factCardIds).toEqual([])
    expect(result.current.submitCardIds).toEqual(['AS'])
    expect(result.current.handCardIds).toEqual(['2H', '3C', '4D', '5S', '6H'])
  })
})
