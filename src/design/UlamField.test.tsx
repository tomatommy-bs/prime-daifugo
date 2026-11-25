import { renderWithProviders } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import { UlamField, ulamGeometry } from './UlamField'

const count = (c: HTMLElement, kind: 'prime' | 'composite') =>
  Number(c.querySelector(`[data-cell="${kind}"]`)?.getAttribute('data-count'))

describe('UlamField', () => {
  it('draws primes as squares for a 7×7 field', () => {
    const { container } = renderWithProviders(<UlamField side={7} />)
    expect(count(container, 'prime')).toBe(15)
    expect(count(container, 'composite')).toBe(34)
  })
  it('is two paths, however large the field (the home backdrop is 55×55)', () => {
    const { container } = renderWithProviders(<UlamField side={55} cell={20} reveal={true} />)
    expect(container.querySelectorAll('svg *')).toHaveLength(2)
    expect(count(container, 'prime') + count(container, 'composite')).toBe(55 * 55)
  })
  it('one square subpath per prime and one dot per composite', () => {
    const g = ulamGeometry(7, 8)
    expect(g.primes.match(/M/g)).toHaveLength(15)
    expect(g.dots.match(/M/g)).toHaveLength(34)
    expect(g.size).toBe(56)
  })
  it('is always aria-hidden', () => {
    const { container } = renderWithProviders(<UlamField side={5} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('rounds an even side up to odd', () => {
    const { container } = renderWithProviders(<UlamField side={4} cell={4} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '20')
  })
  it('reveals with one clip animation, static under reduced motion', () => {
    const full = renderWithProviders(<UlamField side={5} reveal={true} />, {
      reducedMotion: false,
    })
    expect(full.container.querySelector('svg')).toHaveAttribute('data-motion', 'full')
    expect(full.container.querySelector('svg')).toHaveAttribute('data-reveal', 'true')
    full.unmount()
    const reduced = renderWithProviders(<UlamField side={5} reveal={true} />, {
      reducedMotion: true,
    })
    expect(reduced.container.querySelector('svg')).toHaveAttribute('data-motion', 'reduced')
    expect(reduced.container.querySelector('svg')).not.toHaveAttribute('data-reveal')
    expect(count(reduced.container, 'prime')).toBe(9)
  })
})
