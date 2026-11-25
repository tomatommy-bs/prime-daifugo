/**
 * Characterization tests for `useMyField` (the local tray model).
 */
import type { CardId } from '@/game-card/src'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMyField } from './hooks'

const showMock = vi.hoisted(() => vi.fn())
vi.mock('@mantine/notifications', () => ({
  notifications: { show: showMock },
}))

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
