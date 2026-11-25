import { renderWithProviders } from '@/test-utils'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RECONNECTING_SUFFIX, Seat, type SeatProps, seatLabel } from './Seat'

const base: SeatProps = { name: 'bob', handCount: 9, hueIndex: 1, layout: 'chip' }
const seatEl = () => screen.getByRole('group')

describe('Seat', () => {
  it.each(['chip', 'node'] as const)(
    'opponent (%s): shows the count only, never card faces',
    (layout) => {
      const { container } = renderWithProviders(<Seat {...base} layout={layout} />)
      expect(within(seatEl()).getByText('9')).toBeInTheDocument()
      // no selectable faces and no face cards at all
      expect(screen.queryAllByRole('option')).toHaveLength(0)
      expect(container.querySelectorAll('[data-card]:not([data-card="Back"])')).toHaveLength(0)
      // only decorative backs
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
      }
    },
  )

  it('self never shows faces either', () => {
    renderWithProviders(<Seat {...base} isSelf={true} handCount={7} />)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('あなた')).toBeInTheDocument()
  })

  it('observer: 観戦 and no hand count', () => {
    const { container } = renderWithProviders(
      <Seat {...base} handCount={null} observer={true} name="dave" />,
    )
    expect(screen.getByText('観戦')).toBeInTheDocument()
    expect(container.querySelector('[data-hand-count]')).toBeNull()
    expect(container.querySelector('[data-mini-back]')).toBeNull()
    expect(seatEl()).toHaveAccessibleName('dave、観戦')
  })

  it('lead ▲ and passed ∅ markers', () => {
    renderWithProviders(<Seat {...base} isLead={true} passed={true} />)
    expect(screen.getByText('▲')).toHaveAttribute('data-marker', 'lead')
    expect(screen.getByText('∅')).toHaveAttribute('data-marker', 'passed')
    expect(seatEl()).toHaveAttribute('data-passed', 'true')
  })

  it('no markers by default', () => {
    renderWithProviders(<Seat {...base} />)
    expect(screen.queryByText('▲')).toBeNull()
    expect(screen.queryByText('∅')).toBeNull()
    expect(seatEl()).not.toHaveAttribute('aria-current')
  })

  it('active seat → aria-current="true"', () => {
    renderWithProviders(<Seat {...base} isActive={true} />)
    expect(seatEl()).toHaveAttribute('aria-current', 'true')
    expect(seatEl()).toHaveAttribute('data-active', 'true')
  })

  it.each([
    [0, 'var(--seat-0)'],
    [1, 'var(--seat-1)'],
    [3, 'var(--seat-3)'],
    [5, 'var(--seat-1)'],
  ])('hue index %i → %s', (hueIndex, cssVar) => {
    const { container } = renderWithProviders(<Seat {...base} hueIndex={hueIndex} />)
    expect(seatEl().style.getPropertyValue('--seat-hue')).toBe(cssVar)
    const dot = container.querySelector('[data-hue]') as HTMLElement
    expect(dot).toHaveAttribute('data-hue', String(hueIndex))
    expect(dot.style.background).toBe('var(--seat-hue)')
  })

  it('+n penalty chip', () => {
    renderWithProviders(<Seat {...base} penalty={2} />)
    expect(screen.getByText('+2')).toHaveAttribute('data-marker', 'penalty')
  })

  it('no penalty chip for 0', () => {
    renderWithProviders(<Seat {...base} penalty={0} />)
    expect(screen.queryByText('+0')).toBeNull()
  })

  it('node layout shows the turn timer on the active seat', () => {
    renderWithProviders(
      <Seat {...base} layout="node" isActive={true} leftTime={42} timeLimit={60} />,
    )
    expect(screen.getByRole('timer')).toHaveAttribute('aria-valuenow', '42')
  })

  it('chip layout leaves the timer to the seat line', () => {
    renderWithProviders(<Seat {...base} isActive={true} leftTime={42} timeLimit={60} />)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('accessible summary', () => {
    renderWithProviders(<Seat {...base} isLead={true} isActive={true} penalty={2} />)
    expect(seatEl()).toHaveAccessibleName('bob、手札 9 枚、場の主、ペナルティ +2 枚、手番')
  })

  it('data-motion follows reduced motion', () => {
    renderWithProviders(<Seat {...base} isActive={true} />, { reducedMotion: true })
    expect(seatEl()).toHaveAttribute('data-motion', 'reduced')
  })

  it('data-motion full by default', () => {
    renderWithProviders(<Seat {...base} />, { reducedMotion: false })
    expect(seatEl()).toHaveAttribute('data-motion', 'full')
  })

  it('variant slot only carries default', () => {
    renderWithProviders(<Seat {...base} variant="default" />)
    expect(seatEl()).toHaveAttribute('data-variant', 'default')
  })

  it('connected={false}: dashed outline, ◌ marker and the （再接続中） aria suffix', () => {
    renderWithProviders(<Seat {...base} connected={false} />)
    expect(seatEl()).toHaveAttribute('data-connected', 'false')
    expect(seatEl().style.outline).toBe('1px dashed var(--border-strong)')
    expect(screen.getByText('◌')).toHaveAttribute('data-marker', 'offline')
    expect(seatEl()).toHaveAccessibleName('bob、手札 9 枚（再接続中）')
    expect(RECONNECTING_SUFFIX).toBe('（再接続中）')
  })

  it.each([undefined, true])('connected=%s renders the default seat', (connected) => {
    renderWithProviders(<Seat {...base} connected={connected} />)
    expect(seatEl()).not.toHaveAttribute('data-connected')
    expect(seatEl().style.outline).toBe('')
    expect(screen.queryByText('◌')).toBeNull()
    expect(seatEl()).toHaveAccessibleName('bob、手札 9 枚')
  })

  it('a reconnecting active node keeps its other markers', () => {
    renderWithProviders(
      <Seat {...base} layout="node" connected={false} isActive={true} isLead={true} />,
    )
    expect(screen.getByText('▲')).toBeInTheDocument()
    expect(screen.getByText('◌')).toBeInTheDocument()
    expect(seatEl()).toHaveAccessibleName('bob、手札 9 枚、場の主、手番（再接続中）')
  })

  it('unknown hand count shows —', () => {
    renderWithProviders(<Seat {...base} handCount={null} />)
    expect(within(seatEl()).getByText('—')).toBeInTheDocument()
  })
})

describe('seatLabel', () => {
  it('self, passed', () => {
    expect(seatLabel({ name: 'alice', handCount: 3, isSelf: true, passed: true })).toBe(
      'alice（あなた）、手札 3 枚、パス',
    )
  })
  it('a reconnecting observer', () => {
    expect(seatLabel({ name: 'dave', handCount: null, observer: true, connected: false })).toBe(
      'dave、観戦（再接続中）',
    )
  })
})

describe('Seat flight anchor', () => {
  it('writes the player id to data-seat-anchor for card flights', () => {
    renderWithProviders(<Seat {...base} id="p2" />)
    expect(seatEl()).toHaveAttribute('data-seat-anchor', 'p2')
  })
})
