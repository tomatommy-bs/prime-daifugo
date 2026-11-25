import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NameLengthMeter, nameLengthState } from './name-length-meter'

const ticks = (container: HTMLElement, kind: string) =>
  container.querySelectorAll(`[data-tick="${kind}"]`).length

describe('nameLengthState', () => {
  it.each([
    [0, 'empty'],
    [1, 'short'],
    [2, 'short'],
    [3, 'ok'],
    [10, 'ok'],
    [11, 'long'],
  ] as const)('%i characters → %s', (length, state) => {
    expect(nameLengthState(length)).toBe(state)
  })
})

describe('NameLengthMeter', () => {
  it('is a meter with 10 ticks and aria values', () => {
    const { container } = renderWithProviders(<NameLengthMeter length={5} />)
    const meter = screen.getByRole('meter', { name: '名前の文字数' })
    expect(meter).toHaveAttribute('aria-valuenow', '5')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(10)
    expect(ticks(container, 'filled')).toBe(5)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('draws the ticks below the minimum hollow and dashed while empty', () => {
    const { container } = renderWithProviders(<NameLengthMeter length={0} />)
    const below = container.querySelectorAll<HTMLElement>('[data-tick="below-min"]')
    expect(below).toHaveLength(2)
    for (const tick of below) {
      expect(tick.style.border).toContain('dashed')
    }
    expect(ticks(container, 'filled')).toBe(0)
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'empty')
    expect(screen.queryByText('✗')).not.toBeInTheDocument()
  })

  it('marks a too-short name with --danger and ✗', () => {
    const { container } = renderWithProviders(<NameLengthMeter length={2} />)
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'short')
    expect(screen.getByText('✗')).toBeInTheDocument()
    const filled = container.querySelector<HTMLElement>('[data-tick="filled"]')
    expect(filled?.style.border).toContain('var(--danger)')
    expect(ticks(container, 'below-min')).toBe(0)
  })

  it('marks a too-long name and caps the filled ticks at 10', () => {
    const { container } = renderWithProviders(<NameLengthMeter length={12} />)
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'long')
    expect(ticks(container, 'filled')).toBe(10)
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('uses --mod for filled ticks in range', () => {
    const { container } = renderWithProviders(<NameLengthMeter length={3} />)
    const filled = container.querySelector<HTMLElement>('[data-tick="filled"]')
    expect(filled?.style.border).toContain('var(--mod)')
  })

  it('carries data-motion', () => {
    renderWithProviders(<NameLengthMeter length={3} />, { reducedMotion: true })
    expect(screen.getByRole('meter')).toHaveAttribute('data-motion', 'reduced')
  })
})
