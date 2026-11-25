import { renderWithProviders } from '@/test-utils'
import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Loading from './loading'

describe('/room/new loading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the caption as a status', () => {
    renderWithProviders(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('部屋を探しています…')
  })

  it('renders a 1…100 sieve with 25 filled primes that strikes composites', () => {
    const { container } = renderWithProviders(<Loading />, { reducedMotion: false })
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-animate', 'true')
    expect(container.querySelectorAll('[data-cell="prime"]')).toHaveLength(25)
    expect(container.querySelector('[data-cell="prime"]')).toHaveAttribute('fill-opacity', '1')
    expect(container.querySelector('[data-strike]')).toBeInTheDocument()
  })

  it('restarts the passes on a loop', () => {
    vi.useFakeTimers()
    const { container } = renderWithProviders(<Loading />, { reducedMotion: false })
    const before = container.querySelector('svg')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('svg')).not.toBe(before)
  })

  it('is static under reduced motion', () => {
    vi.useFakeTimers()
    const { container } = renderWithProviders(<Loading />, { reducedMotion: true })
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('data-motion', 'reduced')
    expect(svg).toHaveAttribute('data-animate', 'false')
    expect(container.querySelector('[data-strike]')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-cell="prime"]')).toHaveLength(25)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(container.querySelector('svg')).toBe(svg)
  })
})
