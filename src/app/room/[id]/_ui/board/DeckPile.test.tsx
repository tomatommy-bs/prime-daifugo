import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DRAW_REASON_TEXT, DeckPile, drawReason } from './DeckPile'

const drawButton = () => screen.getByRole('button', { name: /引く/ })

describe('drawReason', () => {
  it.each([
    [true, 5, 'drawn', null],
    [false, 5, 'drawn', 'drawn'],
    [false, 5, 'not-your-turn', 'not-your-turn'],
    [false, 0, null, 'empty'],
    [false, 5, null, null],
  ] as const)('canDraw %s, count %i, reason %s → %s', (can, count, given, expected) => {
    expect(drawReason(can, count, given)).toBe(expected)
  })
})

describe('DeckPile', () => {
  it('shows the stack, the count and the deck anchor', () => {
    const { container } = renderWithProviders(<DeckPile count={23} canDraw={true} />)
    const anchor = container.querySelector('[data-anchor="deck"]')
    expect(anchor).not.toBeNull()
    expect(anchor?.querySelectorAll('[data-deck-back]')).toHaveLength(3)
    expect(screen.getByText('山札 23 枚')).toBeInTheDocument()
  })

  it.each([
    [2, 2],
    [1, 1],
    [0, 0],
  ])('count %i → %i backs', (count, backs) => {
    const { container } = renderWithProviders(<DeckPile count={count} canDraw={false} />)
    expect(container.querySelectorAll('[data-deck-back]')).toHaveLength(backs)
    if (count === 0) {
      expect(container.querySelector('[data-deck-empty]')).not.toBeNull()
    }
  })

  it('calls onDraw when drawing is allowed', () => {
    const onDraw = vi.fn()
    renderWithProviders(<DeckPile count={23} canDraw={true} onDraw={onDraw} />)
    fireEvent.click(drawButton())
    expect(onDraw).toHaveBeenCalledTimes(1)
    expect(drawButton()).not.toHaveAttribute('aria-disabled')
  })

  it.each([
    ['drawn', 'ドロー済み'],
    ['empty', '山札なし'],
    ['not-your-turn', '手番ではありません'],
  ] as const)(
    'disabled reason %s → %s (description + tooltip), no onDraw',
    async (reason, text) => {
      const onDraw = vi.fn()
      renderWithProviders(
        <DeckPile
          count={reason === 'empty' ? 0 : 9}
          canDraw={false}
          disabledReason={reason}
          onDraw={onDraw}
        />,
      )
      expect(DRAW_REASON_TEXT[reason]).toBe(text)
      const button = drawButton()
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription(text)
      fireEvent.click(button)
      expect(onDraw).not.toHaveBeenCalled()
      // hovering reveals the tooltip
      fireEvent.mouseEnter(button)
      await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThanOrEqual(2))
    },
  )

  it('without onDraw it is a display only (reason as title)', () => {
    const { container } = renderWithProviders(
      <DeckPile count={4} canDraw={false} disabledReason="drawn" />,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('[data-deck-pile]')).toHaveAttribute('title', 'ドロー済み')
  })

  it('compact uses fixed-size backs', () => {
    const { container } = renderWithProviders(<DeckPile count={4} canDraw={true} compact={true} />)
    expect(container.querySelector('[data-anchor="deck"]')).toHaveStyle({ height: '44px' })
  })

  it('never renders faces', () => {
    renderWithProviders(<DeckPile count={23} canDraw={true} onDraw={vi.fn()} />)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('data-motion follows reduced motion', () => {
    const { container } = renderWithProviders(<DeckPile count={3} canDraw={true} />, {
      reducedMotion: true,
    })
    expect(container.querySelector('[data-deck-pile]')).toHaveAttribute('data-motion', 'reduced')
  })
})
