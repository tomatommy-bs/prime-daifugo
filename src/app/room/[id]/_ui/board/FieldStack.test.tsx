import type { CardId } from '@/game-card/src'
import { renderWithProviders } from '@/test-utils'
import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldStack, constraintReadout, historyValues } from './FieldStack'

// 13 → [KS]; 47 → [4H, 7C]; 1013 → [10D, KH]
const PLAY_13: CardId[] = ['KS']
const PLAY_47: CardId[] = ['4H', '7C']
const PLAY_1013: CardId[] = ['10D', 'KH']

afterEach(() => {
  vi.useRealTimers()
})

describe('field helpers', () => {
  it.each([
    [null, 'k = 自由'],
    [[], 'k = 自由'],
    [PLAY_1013, 'k = 2 枚 · > 1013'],
    [['AS'] as CardId[], 'k = 1 枚 · > 1'],
    [['QS', 'JD', '3C'] as CardId[], 'k = 3 枚 · > 12113'],
  ])('constraintReadout(%j) = %s', (top, text) => {
    expect(constraintReadout(top)).toBe(text)
  })

  it('historyValues excludes the top', () => {
    expect(historyValues([PLAY_13, PLAY_47, PLAY_1013])).toEqual([13, 47])
    expect(historyValues([])).toEqual([])
  })
})

describe('FieldStack', () => {
  it('shows the sequence, the top cards and = value', () => {
    const { container } = renderWithProviders(
      <FieldStack field={[PLAY_13, PLAY_47, PLAY_1013]} leadName="bob" />,
    )
    expect(container.querySelector('[data-field-sequence]')).toHaveTextContent('13 < 47 <')
    expect(screen.getByText('k = 2 枚 · > 1013')).toBeInTheDocument()
    expect(screen.getByText('場 1013')).toBeInTheDocument() // NumberGlyph sr label
    expect(container.querySelector('[data-tone="prime"]')).toHaveAttribute('data-value', '1013')
    expect(screen.getByRole('list', { name: '場のカード 10, 13' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-field-top] li[data-card]')).toHaveLength(2)
    expect(container.querySelector('[data-confirmed]')).not.toBeNull()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('k = 自由 when the field is empty', () => {
    const { container } = renderWithProviders(<FieldStack field={[]} leadName="bob" />)
    expect(screen.getByText('k = 自由')).toBeInTheDocument()
    expect(container.querySelector('[data-field-stack]')).toHaveAttribute('data-empty', 'true')
    expect(container.querySelector('[data-field-top]')).toBeNull()
    // no lead without a field
    expect(screen.queryByText('bob')).toBeNull()
  })

  it('collapses history past compactHistory', () => {
    const { container } = renderWithProviders(
      <FieldStack field={[['2S'], ['5S'], PLAY_13, PLAY_47, PLAY_1013]} compactHistory={3} />,
    )
    expect(container.querySelector('[data-field-sequence]')).toHaveTextContent('… < 5 < 13 < 47 <')
  })

  it('does not render field cards as selectable options', () => {
    renderWithProviders(<FieldStack field={[PLAY_1013]} />)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('layers the result overlay', () => {
    const { container } = renderWithProviders(
      <FieldStack field={[PLAY_1013]} resultOverlay={<span>overlay</span>} />,
    )
    expect(container.querySelector('[data-field-overlay]')).toHaveTextContent('overlay')
  })

  it('strikes the last sequence on flow, then clears to k = 自由', () => {
    vi.useFakeTimers()
    const { container, rerender } = renderWithProviders(
      <FieldStack field={[PLAY_13, PLAY_47, PLAY_1013]} />,
    )
    rerender(<FieldStack field={[]} />)
    expect(screen.getByText('k = 自由')).toBeInTheDocument()
    const struck = container.querySelector('[data-field-sequence][data-struck="true"]')
    expect(struck).toHaveTextContent('13 < 47 < 1013')
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(3)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(container.querySelector('[data-struck]')).toBeNull()
  })

  it('variant slot carries default only', () => {
    const { container } = renderWithProviders(<FieldStack field={[]} variant="default" />)
    expect(container.querySelector('[data-field-stack]')).toHaveAttribute('data-variant', 'default')
  })

  it('never shows primality wording', () => {
    const { container } = renderWithProviders(<FieldStack field={[PLAY_13, PLAY_1013]} />)
    const text = container.querySelector('[data-field-stack]')?.textContent ?? ''
    expect(text).toContain('1013')
    expect(text).not.toMatch(/素数|prime|∈ℙ|∉ℙ/)
  })

  it('data-motion follows reduced motion', () => {
    const { container } = renderWithProviders(<FieldStack field={[PLAY_1013]} />, {
      reducedMotion: true,
    })
    expect(container.querySelector('[data-field-stack]')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-confirmed]')).not.toBeNull()
  })
})
