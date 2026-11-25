import type { CardId } from '@/game-card/src'
import { cardIds as ALL } from '@/game-card/src'
import { renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hand, resolveHandLayout } from './Hand'
import { FRESH_MS } from './card-tray-utils'

const HAND: CardId[] = ['AS', '3H', '7C', 'JD', 'KS']

const setup = (props: Partial<Parameters<typeof Hand>[0]> = {}) => {
  const onSelect = vi.fn()
  const utils = renderWithProviders(
    <Hand
      cardIds={HAND}
      isMyTurn={true}
      mode="basic"
      onSelect={onSelect}
      width={800}
      cardHeight={100}
      {...props}
    />,
  )
  const listbox = screen.getByRole('listbox', { name: '手札' })
  const options = () => within(listbox).getAllByRole('option')
  return { ...utils, onSelect, listbox, options }
}

describe('Hand', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a horizontal listbox of options', () => {
    const { listbox, options } = setup()
    expect(listbox).toHaveAttribute('aria-orientation', 'horizontal')
    expect(options()).toHaveLength(5)
    expect(options().map((o) => o.getAttribute('data-card'))).toEqual(HAND)
    for (const o of options()) {
      expect(o).toHaveAttribute('aria-selected', 'false')
    }
  })

  it('uses a roving tabindex moved by ←/→/Home/End', () => {
    const { options } = setup()
    const tabIndexes = () => options().map((o) => o.getAttribute('tabindex'))
    expect(tabIndexes()).toEqual(['0', '-1', '-1', '-1', '-1'])

    options()[0].focus()
    fireEvent.keyDown(options()[0], { key: 'ArrowRight' })
    expect(tabIndexes()).toEqual(['-1', '0', '-1', '-1', '-1'])
    expect(options()[1]).toHaveFocus()

    fireEvent.keyDown(options()[1], { key: 'End' })
    expect(options()[4]).toHaveFocus()
    fireEvent.keyDown(options()[4], { key: 'ArrowRight' })
    expect(options()[4]).toHaveFocus() // clamped

    fireEvent.keyDown(options()[4], { key: 'ArrowLeft' })
    expect(options()[3]).toHaveFocus()
    fireEvent.keyDown(options()[3], { key: 'Home' })
    expect(options()[0]).toHaveFocus()
    expect(tabIndexes()[0]).toBe('0')
  })

  it('Enter / Space / click call onSelect with the card', () => {
    const { options, onSelect } = setup()
    fireEvent.keyDown(options()[1], { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith('3H')
    fireEvent.keyDown(options()[2], { key: ' ' })
    expect(onSelect).toHaveBeenLastCalledWith('7C')
    fireEvent.click(options()[4])
    expect(onSelect).toHaveBeenLastCalledWith('KS')
    expect(onSelect).toHaveBeenCalledTimes(3)
  })

  it('keeps focus in the hand when the selected card leaves', () => {
    const { options, rerender, onSelect } = setup()
    options()[0].focus()
    fireEvent.keyDown(options()[0], { key: 'ArrowRight' })
    expect(options()[1]).toHaveFocus()
    rerender(
      <Hand
        cardIds={HAND.filter((c) => c !== '3H')}
        isMyTurn={true}
        mode="basic"
        onSelect={onSelect}
        width={800}
        cardHeight={100}
      />,
    )
    expect(document.activeElement).toHaveAttribute('data-card', '7C')
  })

  it('fans a small hand', () => {
    const { listbox } = setup()
    expect(listbox).toHaveAttribute('data-layout', 'fan')
  })

  it('switches to a scroll-snap row for 30 cards at a small width', () => {
    const thirty = ALL.slice(0, 30) as CardId[]
    const { listbox, options } = setup({ cardIds: thirty, width: 400 })
    expect(listbox).toHaveAttribute('data-layout', 'scroll')
    expect(options()).toHaveLength(30)
    const row = listbox.querySelector('[data-scroll-row]') as HTMLElement
    expect(row.style.scrollSnapType).toBe('x mandatory')
    expect(options()[0].style.scrollSnapAlign).toBe('start')
  })

  it('honours explicit layouts', () => {
    const { listbox, rerender, onSelect } = setup({ layout: 'wrap' })
    expect(listbox).toHaveAttribute('data-layout', 'wrap')
    rerender(
      <Hand
        cardIds={HAND}
        isMyTurn={true}
        mode="basic"
        onSelect={onSelect}
        layout="scroll"
        width={800}
        cardHeight={100}
      />,
    )
    expect(screen.getByRole('listbox', { name: '手札' })).toHaveAttribute('data-layout', 'scroll')
  })

  it('marks freshIds as fresh for 2584 ms', () => {
    vi.useFakeTimers()
    const { options } = setup({ freshIds: ['7C'] })
    const state = (card: string) =>
      options()
        .find((o) => o.getAttribute('data-card') === card)
        ?.getAttribute('data-state')
    expect(state('7C')).toBe('fresh')
    expect(state('AS')).toBe('rest')
    act(() => {
      vi.advanceTimersByTime(FRESH_MS - 1)
    })
    expect(state('7C')).toBe('fresh')
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(state('7C')).toBe('rest')
  })

  it('on my turn shows the turn rule; off turn only desaturates', () => {
    const { listbox, container, rerender, onSelect } = setup()
    const panel = container.querySelector('[data-my-turn]') as HTMLElement
    expect(panel).toHaveAttribute('data-my-turn', 'true')
    expect(listbox.style.filter).toBe('')
    rerender(
      <Hand
        cardIds={HAND}
        isMyTurn={false}
        mode="basic"
        onSelect={onSelect}
        width={800}
        cardHeight={100}
      />,
    )
    expect(panel).toHaveAttribute('data-my-turn', 'false')
    expect(listbox.style.filter).toBe('saturate(.618)')
    expect(listbox.style.opacity).toBe('')
    // selection still works off turn
    fireEvent.click(within(listbox).getAllByRole('option')[0])
    expect(onSelect).toHaveBeenCalledWith('AS')
  })

  it('shows value chips when asked', () => {
    const { container } = setup({ showValues: true })
    const chips = Array.from(container.querySelectorAll('[data-value-chip]')).map(
      (c) => c.textContent,
    )
    expect(chips).toEqual(['1', '3', '7', '11', '13'])
  })

  it('writes data-motion and has no glow under reduced motion', () => {
    const { container, rerender, onSelect } = setup({ isMyTurn: false })
    expect(container.querySelector('[data-my-turn]')).toHaveAttribute('data-motion', 'full')
    rerender(
      <Hand
        cardIds={HAND}
        isMyTurn={true}
        mode="basic"
        onSelect={onSelect}
        width={800}
        cardHeight={100}
      />,
    )
    expect(container.querySelector('[data-turn-glow]')).toBeInTheDocument()
  })

  it('reduced motion: data-motion="reduced", no glow', () => {
    const onSelect = vi.fn()
    const { container, rerender } = renderWithProviders(
      <Hand cardIds={HAND} isMyTurn={false} mode="basic" onSelect={onSelect} width={800} />,
      { reducedMotion: true },
    )
    rerender(<Hand cardIds={HAND} isMyTurn={true} mode="basic" onSelect={onSelect} width={800} />)
    expect(container.querySelector('[data-my-turn]')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-turn-glow]')).toBeNull()
  })

  it('empty hand still renders a focusable listbox', () => {
    const { listbox } = setup({ cardIds: [] })
    expect(listbox).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('手札なし')).toBeInTheDocument()
  })
})

describe('resolveHandLayout', () => {
  it('fan when the slice is wide enough, scroll below max(32px, .38w)', () => {
    expect(resolveHandLayout({ layout: 'auto', n: 5, W: 800, cardW: 69 }).mode).toBe('fan')
    expect(resolveHandLayout({ layout: 'auto', n: 30, W: 400, cardW: 69 }).mode).toBe('scroll')
  })
  it('unmeasured width falls back to a non-overlapping row', () => {
    expect(resolveHandLayout({ layout: 'auto', n: 5, W: 0, cardW: 69 })).toMatchObject({
      mode: 'scroll',
      items: [],
    })
  })
  it('forced fan with many cards still positions every card inside W', () => {
    const r = resolveHandLayout({ layout: 'fan', n: 30, W: 400, cardW: 69 })
    expect(r.mode).toBe('fan')
    expect(r.items).toHaveLength(30)
    expect((r.items.at(-1)?.x ?? 0) + 69).toBeLessThanOrEqual(400 + 1e-9)
  })
  it('wrap ignores geometry', () => {
    expect(resolveHandLayout({ layout: 'wrap', n: 30, W: 400, cardW: 69 }).mode).toBe('wrap')
  })
})
