import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameCard } from './game-card'
import { BACK_GEOMETRY } from './icons/Back'

describe('GameCard', () => {
  it('defaults to role="option" with a Japanese label', () => {
    render(<GameCard card="JH" />)
    const card = screen.getByRole('option', { name: 'ハートのJ, 11' })
    expect(card.tagName.toLowerCase()).toBe('svg')
    expect(card).toHaveAttribute('data-card', 'JH')
  })

  it('passes fontSize through (1em = card height)', () => {
    const { container } = render(<GameCard card="3S" fontSize="5rem" />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).toHaveAttribute('font-size', '5rem')
    expect(svg).toHaveAttribute('height', '1em')
    expect(svg).toHaveAttribute('width', '0.69em')
  })

  it('lets the caller override role and aria-label', () => {
    render(<GameCard card="3S" role="img" aria-label="custom" />)
    expect(screen.getByRole('img', { name: 'custom' })).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('omits the default label when decorative', () => {
    const { container } = render(<GameCard card="3S" role="presentation" />)
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-label')
  })

  it('keeps onClick working (story contract)', () => {
    const onClick = vi.fn()
    render(<GameCard card="2C" onClick={onClick} />)
    fireEvent.click(screen.getByRole('option'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not leak "undefined" into the class list', () => {
    const { container, rerender } = render(<GameCard card="2C" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('select-none')
    rerender(<GameCard card="2C" className="x" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('select-none x')
  })

  describe('Back (Ulam spiral)', () => {
    it('is labelled 山札 and keeps the original viewBox', () => {
      render(<GameCard card="Back" />)
      const back = screen.getByRole('option', { name: '山札' })
      expect(back).toHaveAttribute('viewBox', '0 0 201.58 282.22')
      expect(back).toHaveAttribute('data-back', 'ulam')
    })

    it('draws the 85 primes ≤ 441 as squares and one accent', () => {
      expect(BACK_GEOMETRY.primeCount).toBe(85)
      expect(BACK_GEOMETRY.centre).toMatch(/^M.*Z$/)
      const { container } = render(<GameCard card="Back" />)
      expect(container.querySelector('[data-layer="prime"]')).toBeInTheDocument()
      expect(container.querySelector('[data-layer="composite"]')).toBeInTheDocument()
      expect(container.querySelector('[data-layer="one"]')).toHaveAttribute('fill', '#FF8A5C')
    })
  })
})
