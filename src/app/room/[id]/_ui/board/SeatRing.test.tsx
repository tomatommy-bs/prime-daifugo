import { ellipsePoint, seatAngle } from '@/design/math/geometry'
import type { CardId } from '@/game-card/src'
import { makeCtx, makeGameState, makePresence, renderWithProviders } from '@/test-utils'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeatRing, ellipseArcPath, ringGeometry, shortestTurn } from './SeatRing'
import { buildSeats } from './seat-model'

const hand = (n: number) => Array.from({ length: n }, () => 'AS' as CardId)

function seatsFor(n: 2 | 3 | 4, { selfId = 'p1', currentPlayer = 'p1', observer = false } = {}) {
  const ids = ['p1', 'p2', 'p3', 'p4'].slice(0, n)
  const players = Object.fromEntries(ids.map((id, i) => [id, { hand: hand(3 + i) }]))
  const names = ['alice', 'bob', 'carol', 'dave'].slice(0, n)
  return buildSeats({
    gameState: makeGameState({ players }),
    ctx: makeCtx({ playOrder: observer ? [...ids, 'p9'] : ids, currentPlayer }),
    presence: [
      ...makePresence(names),
      ...(observer ? [{ id: 'p9', name: 'eve', status: 'ready' as const }] : []),
    ],
    selfId,
  })
}

const W = 1000
const H = 600
const ringNames = () =>
  within(screen.getByRole('list', { name: /手番順/ }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('[data-seat-name]')?.textContent)

describe('SeatRing geometry', () => {
  it('a = .42W, b = .34H, centred', () => {
    const g = ringGeometry(1000, 600)
    expect(g.a).toBeCloseTo(420)
    expect(g.b).toBeCloseTo(204)
    expect([g.cx, g.cy]).toEqual([500, 300])
  })

  it.each([
    [0, 90, 90],
    [90, 180, 180],
    [350, 10, 370],
    [10, 350, -10],
    // a half turn is a tie; it resolves counter-clockwise
    [90, 270, -90],
    [450, 90, 450],
    [-90, 180, -180],
  ])('shortestTurn(%i → %i) = %i', (prev, target, next) => {
    expect(shortestTurn(prev, target)).toBeCloseTo(next)
    expect(Math.abs(shortestTurn(prev, target) - prev)).toBeLessThanOrEqual(180)
  })

  it('ellipseArcPath starts and ends on the ellipse', () => {
    const d = ellipseArcPath(100, 50, 0, Math.PI / 2, 4)
    expect(d.startsWith('M100.00 0.00')).toBe(true)
    expect(d.endsWith('L0.00 50.00')).toBe(true)
  })
})

describe('SeatRing', () => {
  it('places self at the bottom (θ = π/2) and the rest clockwise', () => {
    renderWithProviders(<SeatRing seats={seatsFor(4, { selfId: 'p3' })} width={W} height={H} />)
    expect(ringNames()).toEqual(['carol', 'dave', 'alice', 'bob'])
    const items = within(screen.getByRole('list', { name: /手番順/ })).getAllByRole('listitem')
    const { a, b, cx, cy } = ringGeometry(W, H)
    items.forEach((li, k) => {
      const p = ellipsePoint(a, b, seatAngle(k, 4))
      expect(Number.parseFloat(li.style.left)).toBeCloseTo(cx + p.x, 1)
      expect(Number.parseFloat(li.style.top)).toBeCloseTo(cy + p.y, 1)
    })
    // self sits at the bottom centre
    expect(Number.parseFloat(items[0].style.left)).toBeCloseTo(cx, 1)
    expect(Number.parseFloat(items[0].style.top)).toBeCloseTo(cy + b, 1)
  })

  it.each([2, 3, 4] as const)('renders %i player nodes', (n) => {
    renderWithProviders(<SeatRing seats={seatsFor(n)} width={W} height={H} />)
    expect(ringNames()).toHaveLength(n)
    expect(screen.getByRole('list', { name: `ℤ/${n}ℤ 手番順` })).toBeInTheDocument()
  })

  it('excludes observers from the ring', () => {
    renderWithProviders(<SeatRing seats={seatsFor(3, { observer: true })} width={W} height={H} />)
    expect(ringNames()).toEqual(['alice', 'bob', 'carol'])
    const watchers = screen.getByRole('list', { name: '観戦' })
    expect(within(watchers).getByText('eve')).toBeInTheDocument()
  })

  it('draws the turn radius and the direction arc for the active seat', () => {
    const { container } = renderWithProviders(
      <SeatRing seats={seatsFor(3, { currentPlayer: 'p2' })} width={W} height={H} />,
    )
    expect(container.querySelector('[data-seat-ring]')).toHaveAttribute('data-active-k', '1')
    expect(container.querySelector('[data-turn-radius]')).not.toBeNull()
    expect(container.querySelector('[data-direction-arc]')).not.toBeNull()
    const active = screen.getAllByRole('group').filter((g) => g.getAttribute('aria-current'))
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/^bob/)
  })

  it('no active seat (and no radius) when currentPlayer is not a player', () => {
    const { container } = renderWithProviders(
      <SeatRing
        seats={seatsFor(3, { observer: true, currentPlayer: 'p9' })}
        width={W}
        height={H}
      />,
    )
    expect(screen.getAllByRole('group').some((g) => g.hasAttribute('aria-current'))).toBe(false)
    expect(container.querySelector('[data-turn-radius]')).toBeNull()
    expect(container.querySelector('[data-seat-ring]')).not.toHaveAttribute('data-active-k')
  })

  it('renders the table centre and a faint sieve backdrop', () => {
    const { container } = renderWithProviders(
      <SeatRing seats={seatsFor(2)} width={W} height={H}>
        <p>centre</p>
      </SeatRing>,
    )
    expect(screen.getByText('centre')).toBeInTheDocument()
    const backdrop = container.querySelector('[data-sieve-backdrop]')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop?.querySelectorAll('[data-cell="prime"]').length).toBeGreaterThan(0)
  })

  it('shimmers once when shimmerKey changes after mount (full motion)', () => {
    const { container, rerender } = renderWithProviders(
      <SeatRing seats={seatsFor(2)} width={W} height={H} shimmerKey={0} />,
      { reducedMotion: false },
    )
    expect(container.querySelector('[data-sieve-wave]')).toBeNull()
    rerender(<SeatRing seats={seatsFor(2)} width={W} height={H} shimmerKey={1} />)
    expect(container.querySelector('[data-sieve-wave]')).not.toBeNull()
  })

  it('winner ripple and gold flash', () => {
    const { container } = renderWithProviders(
      <SeatRing seats={seatsFor(3)} width={W} height={H} rippleFromId="p2" />,
      { reducedMotion: false },
    )
    expect(container.querySelector('[data-sieve-wave]')).not.toBeNull()
    expect(container.querySelector('[data-winner-flash]')?.closest('li')).toHaveAttribute(
      'data-k',
      '1',
    )
  })

  it('reduced motion: no shimmer or ripple, data-motion="reduced", winner still marked', () => {
    const { container, rerender } = renderWithProviders(
      <SeatRing seats={seatsFor(3)} width={W} height={H} shimmerKey={0} rippleFromId="p2" />,
      { reducedMotion: true },
    )
    rerender(<SeatRing seats={seatsFor(3)} width={W} height={H} shimmerKey={1} rippleFromId="p2" />)
    expect(container.querySelector('[data-seat-ring]')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-sieve-wave]')).toBeNull()
    expect(container.querySelector('[data-winner-flash]')).not.toBeNull()
  })

  it('never renders card faces', () => {
    renderWithProviders(<SeatRing seats={seatsFor(4)} width={W} height={H} />)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
