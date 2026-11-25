import { REDUCED_MOTION_QUERY, renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ERROR_OUTLINE_MS,
  MathCard,
  type MathCardState,
  cardHeight,
  mathCardPropsEqual,
} from './math-card'

const root = () => screen.getByRole('option')

describe('MathCard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each<MathCardState>(['rest', 'selected', 'disabled', 'confirmed', 'error', 'fresh'])(
    'writes data-state="%s"',
    (state) => {
      renderWithProviders(<MathCard card="7H" size="hand" state={state} onActivate={() => {}} />)
      expect(root()).toHaveAttribute('data-state', state)
    },
  )

  it('defaults to rest, role option and the card label', () => {
    renderWithProviders(<MathCard card="QS" size="hand" onActivate={() => {}} />)
    const el = screen.getByRole('option', { name: 'スペードのQ, 12' })
    expect(el).toHaveAttribute('data-state', 'rest')
    expect(el).toHaveAttribute('tabindex', '0')
    expect(el).toHaveAttribute('data-card', 'QS')
  })

  it('is an img when not interactive', () => {
    renderWithProviders(<MathCard card="QS" size="field" />)
    expect(screen.getByRole('img', { name: 'スペードのQ, 12' })).not.toHaveAttribute('tabindex')
  })

  it('the inner GameCard is presentational', () => {
    const { container } = renderWithProviders(<MathCard card="2S" size="tray" />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).toHaveAttribute('role', 'presentation')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('aria-label')
  })

  it('disabled → aria-disabled, desaturated, opacity 1, no activation', () => {
    const onActivate = vi.fn()
    renderWithProviders(<MathCard card="7H" size="hand" state="disabled" onActivate={onActivate} />)
    const el = root()
    expect(el).toHaveAttribute('aria-disabled', 'true')
    expect(el.style.filter).toBe('saturate(.618)')
    expect(el.style.opacity).toBe('1')
    fireEvent.click(el)
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('calls onActivate on click, Enter and Space', () => {
    const onActivate = vi.fn()
    renderWithProviders(<MathCard card="7H" size="hand" onActivate={onActivate} />)
    fireEvent.click(root())
    fireEvent.keyDown(root(), { key: 'Enter' })
    fireEvent.keyDown(root(), { key: ' ' })
    fireEvent.keyDown(root(), { key: 'a' })
    expect(onActivate).toHaveBeenCalledTimes(3)
  })

  it('sets layoutId card-${id} by default and honours an override', () => {
    const { rerender } = renderWithProviders(
      <MathCard card="JD" size="hand" onActivate={() => {}} />,
    )
    expect(root()).toHaveAttribute('data-layout-id', 'card-JD')
    rerender(<MathCard card="JD" size="hand" layoutId="x-1" onActivate={() => {}} />)
    expect(root()).toHaveAttribute('data-layout-id', 'x-1')
  })

  it('backs have no layoutId (they are not unique)', () => {
    renderWithProviders(<MathCard card="Back" size="seat" />)
    expect(screen.getByRole('img', { name: '山札' })).not.toHaveAttribute('data-layout-id')
  })

  it('sizes from the card tokens or a CSS length', () => {
    expect(cardHeight('hand')).toBe('var(--card-hand)')
    expect(cardHeight('field')).toBe('var(--card-field)')
    expect(cardHeight('tray')).toBe('var(--card-tray)')
    expect(cardHeight('seat')).toBe('var(--card-seat)')
    expect(cardHeight('3rem')).toBe('3rem')
    const { container } = renderWithProviders(<MathCard card="2S" size="tray" />)
    const face = container.querySelector('[data-face]') as HTMLElement
    expect(face.style.height).toBe('var(--card-tray)')
    expect((container.querySelector('svg') as SVGElement).style.fontSize).toBe('var(--card-tray)')
  })

  it('selected shows the rank badge for court cards only', () => {
    const { container, rerender } = renderWithProviders(
      <MathCard card="JS" size="tray" state="selected" onActivate={() => {}} />,
    )
    expect(container.querySelector('[data-badge]')).toHaveTextContent('J=11')
    rerender(<MathCard card="7S" size="tray" state="selected" onActivate={() => {}} />)
    expect(container.querySelector('[data-badge]')).toBeNull()
  })

  it('confirmed and fresh draw their underline markers', () => {
    const { container, rerender } = renderWithProviders(
      <MathCard card="7S" size="field" state="confirmed" />,
    )
    expect(container.querySelector('[data-marker="confirmed"]')).toBeInTheDocument()
    rerender(<MathCard card="7S" size="field" state="fresh" />)
    expect(container.querySelector('[data-marker="fresh"]')).toBeInTheDocument()
  })

  it('error outline lasts 610 ms', async () => {
    vi.useFakeTimers()
    const { container } = renderWithProviders(<MathCard card="7S" size="hand" state="error" />)
    expect(container.querySelector('[data-marker="error"]')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(ERROR_OUTLINE_MS - 10)
    })
    expect(container.querySelector('[data-marker="error"]')).toHaveStyle({ opacity: '1' })
    act(() => {
      vi.advanceTimersByTime(20)
    })
    vi.useRealTimers()
    // the exit fade is driven by animation frames
    await waitFor(() => expect(container.querySelector('[data-marker="error"]')).toBeNull())
  })

  it('value chip shows A=1 … K=13', () => {
    const { container } = renderWithProviders(<MathCard card="KD" size="hand" showValue={true} />)
    expect(container.querySelector('[data-value-chip]')).toHaveTextContent('13')
  })

  it('writes data-motion and follows reduced motion', () => {
    const { container, unmount } = renderWithProviders(<MathCard card="7S" size="hand" />)
    expect(container.querySelector('[data-card="7S"]')).toHaveAttribute('data-motion', 'full')
    unmount()
    renderWithProviders(<MathCard card="7S" size="hand" />, { reducedMotion: true })
    expect(screen.getByRole('img')).toHaveAttribute('data-motion', 'reduced')
    expect(window.matchMedia(REDUCED_MOTION_QUERY).matches).toBe(true)
  })

  it('reduced motion keeps the error outline (information is never lost)', () => {
    vi.useFakeTimers()
    const { container } = renderWithProviders(<MathCard card="7S" size="hand" state="error" />, {
      reducedMotion: true,
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(container.querySelector('[data-marker="error"]')).toBeInTheDocument()
  })

  it('renders without unknown-prop warnings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithProviders(
      <MathCard
        card="AS"
        size="hand"
        state="selected"
        showValue={true}
        aria-selected={true}
        onActivate={() => {}}
        motionProps={{ initial: false, animate: { x: 4 } }}
        cardProps={{ className: 'x' }}
      />,
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('passes its card to onActivate, so one stable handler serves a whole hand', () => {
    const onActivate = vi.fn()
    renderWithProviders(<MathCard card="9C" size="hand" onActivate={onActivate} />)
    fireEvent.click(root())
    expect(onActivate).toHaveBeenCalledWith('9C')
  })

  it('reduced motion: no shared layoutId (it would teleport); the card fades instead', () => {
    renderWithProviders(<MathCard card="JD" size="hand" onActivate={() => undefined} />, {
      reducedMotion: true,
    })
    expect(root()).not.toHaveAttribute('data-layout-id')
  })
})

describe('mathCardPropsEqual (memo)', () => {
  const noop = () => undefined
  const base = { card: '7H' as const, size: 'hand', onActivate: noop }
  it('treats fresh but equal style / motionProps objects as unchanged', () => {
    const transition = { type: 'spring' as const }
    expect(
      mathCardPropsEqual(
        {
          ...base,
          style: { left: 4, rotate: -5 },
          motionProps: { layout: 'position', transition },
        },
        {
          ...base,
          style: { left: 4, rotate: -5 },
          motionProps: { layout: 'position', transition },
        },
      ),
    ).toBe(true)
  })
  it('detects real changes', () => {
    expect(
      mathCardPropsEqual({ ...base, style: { left: 4 } }, { ...base, style: { left: 5 } }),
    ).toBe(false)
    expect(mathCardPropsEqual(base, { ...base, state: 'selected' })).toBe(false)
    expect(mathCardPropsEqual(base, { ...base, onActivate: () => undefined })).toBe(false)
  })
})
