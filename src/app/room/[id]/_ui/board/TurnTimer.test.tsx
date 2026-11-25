import { timerDash } from '@/design/math/geometry'
import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TurnTimer, displaySeconds, timerGeometry, timerUrgency } from './TurnTimer'

const progress = (c: HTMLElement) => c.querySelector('[data-ring="progress"]') as SVGCircleElement
const dashOffset = (el: Element) =>
  Number.parseFloat(
    el.getAttribute('stroke-dashoffset') ??
      (el as SVGElement).style.strokeDashoffset ??
      (el as SVGElement).style.getPropertyValue('stroke-dashoffset'),
  )

describe('TurnTimer maths', () => {
  it.each([
    [42, 42],
    [0, 0],
    [-3, 0],
    [4.2, 5],
    [null, null],
  ])('displaySeconds(%s) = %s', (left, shown) => {
    expect(displaySeconds(left)).toBe(shown)
  })

  it.each([
    [null, 'none'],
    [60, 'none'],
    [11, 'none'],
    [10, 'warn'],
    [6, 'warn'],
    [5, 'danger'],
    [1, 'danger'],
    [0, 'danger'],
    [-2, 'danger'],
  ] as const)('urgency at %s s → %s', (left, urgency) => {
    expect(timerUrgency(left)).toBe(urgency)
  })

  it('geometry: the ring fits the diameter', () => {
    const { stroke, r, C } = timerGeometry(28)
    expect(r * 2 + stroke).toBeCloseTo(28)
    expect(C).toBeCloseTo(2 * Math.PI * r)
  })
})

describe('TurnTimer', () => {
  it('is a role="timer" with aria values', () => {
    renderWithProviders(<TurnTimer leftTime={42} timeLimit={60} />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveAttribute('aria-valuenow', '42')
    expect(timer).toHaveAttribute('aria-valuemax', '60')
    expect(timer).toHaveAttribute('aria-valuemin', '0')
    expect(timer).toHaveAccessibleName('残り 42 秒')
    expect(timer).toHaveTextContent('42')
  })

  it('draws the arc as leftTime / timeLimit (strokeDashoffset)', () => {
    const { container } = renderWithProviders(<TurnTimer leftTime={15} timeLimit={60} />)
    const ring = progress(container)
    const C = Number(ring.getAttribute('stroke-dasharray'))
    const { C: expectedC } = timerGeometry(28)
    expect(C).toBeCloseTo(expectedC)
    expect(dashOffset(ring)).toBeCloseTo(timerDash(15, 60, C), 3)
    expect(dashOffset(ring)).toBeCloseTo(C * 0.75, 3)
  })

  it('full time → offset 0; zero → offset C', () => {
    const full = renderWithProviders(<TurnTimer leftTime={60} timeLimit={60} />)
    expect(dashOffset(progress(full.container))).toBeCloseTo(0)
    full.unmount()
    const empty = renderWithProviders(<TurnTimer leftTime={0} timeLimit={60} />)
    const ring = progress(empty.container)
    expect(dashOffset(ring)).toBeCloseTo(Number(ring.getAttribute('stroke-dasharray')))
  })

  it('clamps a negative server clock to 0', () => {
    const { container } = renderWithProviders(<TurnTimer leftTime={-4} timeLimit={60} />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveAttribute('aria-valuenow', '0')
    expect(timer).toHaveTextContent('0')
    expect(timer).not.toHaveTextContent('-4')
    const ring = progress(container)
    expect(dashOffset(ring)).toBeCloseTo(Number(ring.getAttribute('stroke-dasharray')))
    expect(screen.getByText('時間切れ')).toBeInTheDocument()
  })

  it.each([
    [11, 'none'],
    [10, 'warn'],
    [5, 'danger'],
  ] as const)('data-urgency at %s s is %s', (left, urgency) => {
    renderWithProviders(<TurnTimer leftTime={left} timeLimit={60} />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-urgency', urgency)
  })

  it('uses --danger from 10 s and pulses the digits from 5 s', () => {
    const warn = renderWithProviders(<TurnTimer leftTime={8} timeLimit={60} />, {
      reducedMotion: false,
    })
    expect(progress(warn.container).getAttribute('stroke')).toBe('var(--danger)')
    expect(warn.container.querySelector('[data-pulse]')).toBeNull()
    warn.unmount()
    const danger = renderWithProviders(<TurnTimer leftTime={4} timeLimit={60} />, {
      reducedMotion: false,
    })
    expect(danger.container.querySelector('[data-pulse="true"]')).not.toBeNull()
    danger.unmount()
    const calm = renderWithProviders(<TurnTimer leftTime={30} timeLimit={60} />)
    expect(progress(calm.container).getAttribute('stroke')).toBe('var(--mod)')
  })

  it('shows — with no clock yet', () => {
    renderWithProviders(<TurnTimer leftTime={null} timeLimit={60} />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('—')
    expect(timer).not.toHaveAttribute('aria-valuenow')
    expect(timer).toHaveAttribute('data-urgency', 'none')
  })

  it('honours size', () => {
    renderWithProviders(<TurnTimer leftTime={30} timeLimit={60} size={44} />)
    expect(screen.getByRole('timer')).toHaveStyle({ width: '44px', height: '44px' })
  })

  it('reduced motion: no pulse, data-motion="reduced", colour and digits kept', () => {
    const { container } = renderWithProviders(<TurnTimer leftTime={3} timeLimit={60} />, {
      reducedMotion: true,
    })
    const timer = screen.getByRole('timer')
    expect(timer).toHaveAttribute('data-motion', 'reduced')
    expect(timer).toHaveAttribute('data-urgency', 'danger')
    expect(timer).toHaveTextContent('3')
    expect(container.querySelector('[data-pulse]')).toBeNull()
  })

  it('flashes once when the clock runs out', () => {
    const { container, rerender } = renderWithProviders(<TurnTimer leftTime={1} timeLimit={60} />, {
      reducedMotion: false,
    })
    expect(container.querySelector('[data-flash]')).toBeNull()
    rerender(<TurnTimer leftTime={0} timeLimit={60} />)
    expect(container.querySelector('[data-flash="timeout"]')).not.toBeNull()
  })
})
