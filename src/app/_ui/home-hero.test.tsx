import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HomeHero, INTRO_KEY } from './home-hero'

const intro = (container: HTMLElement) =>
  container.querySelector('[data-intro]')?.getAttribute('data-intro')

describe('HomeHero', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('renders the title, subtitle, sieve strip and Ulam backdrop', () => {
    const { container } = renderWithProviders(<HomeHero />)
    expect(screen.getByRole('heading', { level: 1, name: '素数大富豪' })).toBeInTheDocument()
    expect(screen.getByText('Prime Daifugō')).toBeInTheDocument()
    expect(screen.getByRole('math')).toHaveTextContent('∀p∈ℙ, p > 場')
    const backdrop = container.querySelector('[data-hero-backdrop]')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop?.querySelector('svg')).toBeInTheDocument()
    // 2 × 50 strip: 25 primes below 100, at 25 % alpha
    const strip = container.querySelector('[data-hero-strip="stack"]')
    const primes = strip?.querySelectorAll('[data-cell="prime"]') ?? []
    expect(primes).toHaveLength(25)
    expect(primes[0]).toHaveAttribute('fill-opacity', '0.25')
  })

  it.each([
    ['compact', 30, 10],
    ['portrait', 50, 15],
  ] as const)('the %s strip shows 1…%i', (variant, n, primes) => {
    const { container } = renderWithProviders(<HomeHero variant={variant} />)
    const strip = container.querySelector(`[data-hero-strip="${variant}"]`)
    expect(strip?.querySelectorAll('[data-cell]')).toHaveLength(n)
    expect(strip?.querySelectorAll('[data-cell="prime"]')).toHaveLength(primes)
  })

  it('plays the strike-out intro once per session', () => {
    const first = renderWithProviders(<HomeHero />, { reducedMotion: false })
    expect(intro(first.container)).toBe('play')
    expect(first.container.querySelector('[data-strike]')).toBeInTheDocument()
    expect(window.sessionStorage.getItem(INTRO_KEY)).toBe('true')
    first.unmount()

    const second = renderWithProviders(<HomeHero />, { reducedMotion: false })
    expect(intro(second.container)).toBe('static')
    expect(second.container.querySelector('[data-strike]')).not.toBeInTheDocument()
  })

  it('is static under reduced motion and does not consume the intro', () => {
    const { container } = renderWithProviders(<HomeHero />, { reducedMotion: true })
    expect(intro(container)).toBe('static')
    expect(container.querySelector('header')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-strike]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-hero-strip] svg')).toHaveAttribute(
      'data-motion',
      'reduced',
    )
    expect(window.sessionStorage.getItem(INTRO_KEY)).toBeNull()
  })

  it('honours the reduced prop', () => {
    const { container } = renderWithProviders(<HomeHero reduced={true} />, {
      reducedMotion: false,
    })
    expect(intro(container)).toBe('static')
    expect(container.querySelector('header')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-strike]')).not.toBeInTheDocument()
  })

  it('follows an intro state passed by the page', () => {
    const { container } = renderWithProviders(<HomeHero intro="static" />, {
      reducedMotion: false,
    })
    expect(intro(container)).toBe('static')
    // the page owns the decision, so the hero must not mark the session
    expect(window.sessionStorage.getItem(INTRO_KEY)).toBeNull()
  })
})
