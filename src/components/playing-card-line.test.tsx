import { LAYOUT_QUERIES } from '@/design/use-layout-mode'
import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlayingCardLine } from './playing-card-line'

/** Mantine SimpleGrid writes its column count into an injected <style> keyed by class. */
const gridCols = (el: HTMLElement): string => {
  const css = Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n')
  for (const cls of Array.from(el.classList)) {
    const escaped = cls.replace(/[^\w-]/g, '\\$&')
    const m = css.match(new RegExp(`\\.${escaped}\\{[^}]*--sg-cols:\\s*(\\d+)`))
    if (m) {
      return m[1]
    }
  }
  return ''
}

describe('PlayingCardLine', () => {
  it('renders one option per card and calls onClickCard(card, idx)', () => {
    const onClickCard = vi.fn()
    renderWithProviders(<PlayingCardLine cardIds={['2C', '3D', 'JS']} onClickCard={onClickCard} />)
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options).toHaveLength(3)
    fireEvent.click(options[2])
    expect(onClickCard).toHaveBeenCalledWith('JS', 2)
    fireEvent.keyDown(options[0], { key: 'Enter' })
    expect(onClickCard).toHaveBeenLastCalledWith('2C', 0)
  })

  it('produces no unknown-prop warnings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderWithProviders(
      <PlayingCardLine
        cardIds={['2C', '3D']}
        size="s"
        focusable={true}
        onClickCard={() => {}}
        gameCardProps={{ fontSize: '3rem' }}
        className="extra"
      />,
    )
    expect(spy).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    const grid = screen.getByRole('listbox')
    for (const leaked of ['cardids', 'onclickcard', 'gamecardprops', 'focusable', 'size']) {
      expect(grid).not.toHaveAttribute(leaked)
    }
    expect(grid).toHaveClass('extra')
    spy.mockRestore()
    warn.mockRestore()
  })

  it('sizes cards from gameCardProps.fontSize, then the S/M/L option', () => {
    const { container, rerender } = renderWithProviders(
      <PlayingCardLine cardIds={['2C']} gameCardProps={{ fontSize: '3rem' }} />,
    )
    const face = () => container.querySelector('[data-face]') as HTMLElement
    expect(face().style.height).toBe('3rem')
    rerender(<PlayingCardLine cardIds={['2C']} />)
    expect(face().style.height).toBe('5rem')
    rerender(<PlayingCardLine cardIds={['2C']} size="s" />)
    expect(face().style.height).toBe('4rem')
    rerender(<PlayingCardLine cardIds={['2C']} size="l" />)
    expect(face().style.height).toBe('6.25rem')
  })

  it('takes 10 columns on compact, 20 elsewhere, and honours cols', () => {
    const { unmount } = renderWithProviders(<PlayingCardLine cardIds={['2C']} />, {
      media: { [LAYOUT_QUERIES.compact]: true },
    })
    expect(gridCols(screen.getByRole('listbox'))).toBe('10')
    unmount()

    const second = renderWithProviders(<PlayingCardLine cardIds={['2C']} />, {
      media: { [LAYOUT_QUERIES.wide]: true },
    })
    expect(gridCols(screen.getByRole('listbox'))).toBe('20')
    second.unmount()

    renderWithProviders(<PlayingCardLine cardIds={['2C']} cols={7} />)
    expect(gridCols(screen.getByRole('listbox'))).toBe('7')
  })

  it('duplicate ids get distinct layout ids', () => {
    renderWithProviders(<PlayingCardLine cardIds={['2C', '2C']} onClickCard={() => {}} />)
    const ids = screen.getAllByRole('option').map((o) => o.getAttribute('data-layout-id'))
    expect(new Set(ids).size).toBe(2)
  })

  it('unique ids share the board layout id', () => {
    renderWithProviders(<PlayingCardLine cardIds={['2C', '3D']} onClickCard={() => {}} />)
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('data-layout-id', 'card-3D')
  })
})
