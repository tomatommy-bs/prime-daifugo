import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SieveGrid } from './SieveGrid'

describe('SieveGrid', () => {
  it('fills the 25 primes up to 100', () => {
    const { container } = renderWithProviders(<SieveGrid />)
    expect(container.querySelectorAll('[data-cell="prime"]')).toHaveLength(25)
    expect(container.querySelectorAll('[data-cell="composite"]')).toHaveLength(74)
    expect(container.querySelectorAll('[data-cell="unit"]')).toHaveLength(1)
  })
  it('is aria-hidden by default', () => {
    const { container } = renderWithProviders(<SieveGrid n={30} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('can be labelled', () => {
    renderWithProviders(<SieveGrid n={30} aria-hidden={false} />)
    expect(screen.getByRole('img', { name: /1 から 30/ })).toBeInTheDocument()
  })
  it('applies prime opacity', () => {
    const { container } = renderWithProviders(<SieveGrid n={10} primeOpacity={0.25} />)
    expect(container.querySelector('[data-cell="prime"]')).toHaveAttribute('fill-opacity', '0.25')
  })
  it('strikes composites when animating', () => {
    const { container } = renderWithProviders(<SieveGrid animate={true} />, {
      reducedMotion: false,
    })
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-motion', 'full')
    expect(svg).toHaveAttribute('data-animate', 'true')
    // composites up to 100 all have a factor in {2,3,5,7}
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(74)
    expect(container.querySelectorAll('[data-strike="7"]').length).toBeGreaterThan(0)
  })
  it('is static under reduced motion', () => {
    const { container } = renderWithProviders(<SieveGrid animate={true} />, {
      reducedMotion: true,
    })
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-motion', 'reduced')
    expect(svg).toHaveAttribute('data-animate', 'false')
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-cell="prime"]')).toHaveLength(25)
  })
})
