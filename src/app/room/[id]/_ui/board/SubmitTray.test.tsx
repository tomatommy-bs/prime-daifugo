import type { CardId } from '@/game-card/src'
import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubmitTray, type SubmitTrayProps } from './SubmitTray'

const SPOILER = /素数|prime|∈ℙ/

const setup = (props: Partial<SubmitTrayProps> = {}) => {
  const onRemove = vi.fn()
  const onReset = vi.fn()
  const element = (p: Partial<SubmitTrayProps> = {}) => (
    <SubmitTray
      cardIds={['AS', '3H']}
      fieldTop={null}
      onRemove={onRemove}
      onReset={onReset}
      {...props}
      {...p}
    />
  )
  const utils = renderWithProviders(element())
  const root = () => utils.container.querySelector('[data-motion]') as HTMLElement
  return {
    ...utils,
    onRemove,
    onReset,
    root,
    rerenderWith: (p: Partial<SubmitTrayProps>) => utils.rerender(element(p)),
  }
}

describe('SubmitTray', () => {
  it('is a listbox labelled 提出 with selected options', () => {
    setup()
    const listbox = screen.getByRole('listbox', { name: '提出' })
    const options = within(listbox).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('data-card'))).toEqual(['AS', '3H'])
    for (const o of options) {
      expect(o).toHaveAttribute('aria-selected', 'true')
      expect(o).toHaveAttribute('data-state', 'selected')
    }
  })

  it('shows the concatenated value and ≟', () => {
    const { container } = setup()
    expect(container.querySelector('[data-value] [data-value="13"]')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText('≟')).toBeInTheDocument()
  })

  it('shows — for an empty tray and hides the checks', () => {
    const { container } = setup({ cardIds: [] })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.querySelector('[data-check]')).toBeNull()
    expect(screen.getByRole('button', { name: 'リセット' })).toBeDisabled()
  })

  it.each<[CardId[], CardId[] | null, boolean, boolean]>([
    [['AS', '3H'], null, true, true],
    [['AS', '3H'], ['4S', '7D'], true, false],
    [['4S', '7D'], ['AS', '3H'], true, true],
    [['KS'], ['AS', '3H'], false, false],
    [['KS', 'QS', 'JS'], ['AS', '3H'], false, true],
  ])('checks %j against %j → count %s, greater %s', (cards, top, countOk, greaterOk) => {
    const { container } = setup({ cardIds: cards, fieldTop: top })
    const count = container.querySelector('[data-check="count"]') as HTMLElement
    const greater = container.querySelector('[data-check="greater"]') as HTMLElement
    expect(count).toHaveAttribute('data-ok', String(countOk))
    expect(count).toHaveTextContent(`枚数 ${cards.length}`)
    expect(count).toHaveTextContent(countOk ? '✓' : '✗')
    expect(greater).toHaveAttribute('data-ok', String(greaterOk))
    expect(greater).toHaveTextContent('> 場')
    expect(greater).toHaveTextContent(greaterOk ? '✓' : '✗')
  })

  it('goes gold with a G at exactly 57', () => {
    const { root, container, rerenderWith } = setup({ cardIds: ['5S', '7H'] })
    expect(root()).toHaveAttribute('data-grothendieck', 'true')
    expect(container.querySelector('[data-g]')).toHaveTextContent('G')
    expect(container.querySelector('[data-gold-border]')).toBeInTheDocument()
    expect(container.querySelector('[data-tone="gold"]')).toBeInTheDocument()
    expect(container.querySelector('[data-shimmer]')).toBeInTheDocument()
    rerenderWith({ cardIds: ['5S', '7H', '2C'] })
    expect(root()).not.toHaveAttribute('data-grothendieck')
    expect(container.querySelector('[data-gold-border]')).toBeNull()
  })

  it.each<[string, CardId[]]>([
    ['57', ['5S', '7H']],
    ['a prime', ['AS', '3H']],
    ['a composite', ['2S', '2H']],
    ['empty', []],
  ])('anti-spoiler: no primality text for %s', (_label, cards) => {
    const { root } = setup({ cardIds: cards, fieldTop: ['2C'] })
    // the tray root (the container also holds Mantine's <style>, whose tokens say "prime")
    expect(root().textContent ?? '').not.toMatch(SPOILER)
    const labels = Array.from(root().querySelectorAll('[aria-label],[title]'))
      .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`)
      .join(' ')
    expect(labels).not.toMatch(SPOILER)
  })

  it('shakeKey change → data-shake and a danger border', () => {
    const { root, rerenderWith } = setup({ shakeKey: 0 })
    expect(root()).not.toHaveAttribute('data-shake')
    rerenderWith({ shakeKey: 1 })
    expect(root()).toHaveAttribute('data-shake', '1')
    rerenderWith({ shakeKey: 2 })
    expect(root()).toHaveAttribute('data-shake', '2')
  })

  it('reduced motion: no shake or shimmer, the danger border and message stay', () => {
    const onRemove = vi.fn()
    const onReset = vi.fn()
    const el = (p: Partial<SubmitTrayProps>) => (
      <SubmitTray
        cardIds={['5S', '7H']}
        fieldTop={null}
        onRemove={onRemove}
        onReset={onReset}
        {...p}
      />
    )
    const { container, rerender } = renderWithProviders(el({ shakeKey: 0 }), {
      reducedMotion: true,
    })
    rerender(el({ shakeKey: 1, errorMessage: '場と同じ枚数のカードを出してください' }))
    const root = container.querySelector('[data-motion]') as HTMLElement
    expect(root).toHaveAttribute('data-motion', 'reduced')
    expect(root).not.toHaveAttribute('data-shake')
    expect(root).toHaveAttribute('data-danger', 'true')
    expect(container.querySelector('[data-shimmer]')).toBeNull()
    expect(container.querySelector('[data-g]')).toBeInTheDocument() // gold + G kept
    expect(screen.getByText('場と同じ枚数のカードを出してください')).toBeInTheDocument()
  })

  it('shows the error message inline in a polite live region', () => {
    const { container, rerenderWith } = setup()
    const region = container.querySelector('[data-error-region]') as HTMLElement
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
    rerenderWith({ errorMessage: 'カードを選択してください' })
    expect(within(region).getByText('カードを選択してください')).toBeInTheDocument()
  })

  it('removes a card on click / Enter and resets', () => {
    const { onRemove, onReset } = setup()
    const options = screen.getAllByRole('option')
    fireEvent.click(options[0])
    expect(onRemove).toHaveBeenLastCalledWith('AS')
    fireEvent.keyDown(options[1], { key: 'Enter' })
    expect(onRemove).toHaveBeenLastCalledWith('3H')
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('moves focus between tray cards with arrow keys', () => {
    setup()
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1'])
    options[0].focus()
    fireEvent.keyDown(options[0], { key: 'ArrowRight' })
    expect(screen.getAllByRole('option')[1]).toHaveFocus()
  })

  it('reset button is at least 44px', () => {
    setup()
    const btn = screen.getByRole('button', { name: 'リセット' })
    expect(btn.style.minWidth).toBe('44px')
    expect(btn.style.minHeight).toBe('44px')
  })

  it('keeps keyboard focus in the tray when a card is removed (never drops to body)', () => {
    const { rerenderWith } = setup()
    const second = screen.getAllByRole('option')[1]
    second.focus()
    fireEvent.keyDown(second, { key: 'Enter' })
    rerenderWith({ cardIds: ['AS'] }) // the parent removed 3H
    expect(screen.getByRole('option')).toHaveFocus()
    rerenderWith({ cardIds: [] })
    expect(screen.getByRole('listbox', { name: '提出' })).toHaveFocus()
  })

  it('the empty listbox is not a tab stop', () => {
    setup({ cardIds: [] })
    expect(screen.getByRole('listbox', { name: '提出' })).toHaveAttribute('tabindex', '-1')
  })

  it('リセット stays enabled while factor cards remain, even with an empty tray', () => {
    const { onReset } = setup({ cardIds: [], hasFactor: true })
    const reset = screen.getByRole('button', { name: 'リセット' })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('リセット is disabled when there is nothing to clear', () => {
    setup({ cardIds: [] })
    expect(screen.getByRole('button', { name: 'リセット' })).toBeDisabled()
  })
})
