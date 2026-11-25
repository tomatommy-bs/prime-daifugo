import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModRing } from './ModRing'

describe('ModRing', () => {
  it('draws n ticks with `filled` highlighted', () => {
    const { container } = renderWithProviders(<ModRing n={12} filled={5} />)
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(12)
    expect(container.querySelectorAll('[data-tick="filled"]')).toHaveLength(5)
  })
  it('is decorative without a label', () => {
    const { container } = renderWithProviders(<ModRing n={4} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('exposes its label', () => {
    renderWithProviders(<ModRing n={12} spin={true} label="接続中…" />)
    expect(screen.getByRole('img', { name: '接続中…' })).toBeInTheDocument()
  })
  it('spins only with full motion', () => {
    const full = renderWithProviders(<ModRing n={12} spin={true} />, { reducedMotion: false })
    expect(full.container.querySelector('svg')).toHaveAttribute('data-spin', 'true')
    full.unmount()
    const reduced = renderWithProviders(<ModRing n={12} spin={true} />, { reducedMotion: true })
    const svg = reduced.container.querySelector('svg')
    expect(svg).toHaveAttribute('data-motion', 'reduced')
    expect(svg).toHaveAttribute('data-spin', 'false')
  })
})
