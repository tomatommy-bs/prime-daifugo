import { renderWithProviders } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import { UlamField } from './UlamField'

describe('UlamField', () => {
  it('draws primes as squares for a 7×7 field', () => {
    const { container } = renderWithProviders(<UlamField side={7} />)
    expect(container.querySelectorAll('[data-cell="prime"]')).toHaveLength(15)
    expect(container.querySelectorAll('[data-cell="composite"]')).toHaveLength(34)
  })
  it('is always aria-hidden', () => {
    const { container } = renderWithProviders(<UlamField side={5} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('rounds an even side up to odd', () => {
    const { container } = renderWithProviders(<UlamField side={4} cell={4} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '20')
  })
  it('reveals with motion, static under reduced motion', () => {
    const full = renderWithProviders(<UlamField side={5} reveal={true} />, {
      reducedMotion: false,
    })
    expect(full.container.querySelector('svg')).toHaveAttribute('data-motion', 'full')
    full.unmount()
    const reduced = renderWithProviders(<UlamField side={5} reveal={true} />, {
      reducedMotion: true,
    })
    expect(reduced.container.querySelector('svg')).toHaveAttribute('data-motion', 'reduced')
    expect(reduced.container.querySelectorAll('[data-cell="prime"]')).toHaveLength(9)
  })
})
