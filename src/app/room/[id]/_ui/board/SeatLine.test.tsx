import type { CardId } from '@/game-card/src'
import { makeCtx, makeGameState, makePresence, renderWithProviders } from '@/test-utils'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeatLine } from './SeatLine'
import { buildSeats } from './seat-model'

const hand = (n: number) => Array.from({ length: n }, () => 'AS' as CardId)

function seatsFor({
  selfId = 'p1',
  currentPlayer = 'p1',
  observer = false,
  leftTime = 42,
}: { selfId?: string; currentPlayer?: string; observer?: boolean; leftTime?: number } = {}) {
  const players = { p1: { hand: hand(7) }, p2: { hand: hand(9) }, p3: { hand: hand(3) } }
  return buildSeats({
    gameState: makeGameState({ players, deckTopPlayer: 'p2' }),
    // quirk: an observer (p4) shows up in playOrder
    ctx: makeCtx({
      playOrder: observer ? ['p1', 'p2', 'p4', 'p3'] : ['p1', 'p2', 'p3'],
      currentPlayer,
    }),
    presence: makePresence(['alice', 'bob', 'carol', ...(observer ? ['dave'] : [])]),
    selfId,
    passedIds: ['p3'],
    leftTime,
  })
}

const turnOrder = () => screen.getByRole('list', { name: /手番順/ })
const playerNames = () =>
  within(turnOrder())
    .getAllByRole('group')
    .map((g) => g.querySelector('[data-seat-name]')?.textContent)

describe('SeatLine', () => {
  it('renders the residue ring label and the order rotated to self', () => {
    renderWithProviders(<SeatLine seats={seatsFor({ selfId: 'p2' })} n={3} />)
    expect(screen.getByText('ℤ/3ℤ')).toBeInTheDocument()
    expect(playerNames()).toEqual(['bob', 'carol', 'alice'])
    expect(within(turnOrder()).getByText('①')).toBeInTheDocument()
    expect(within(turnOrder()).getByText('↺')).toBeInTheDocument()
    expect(within(turnOrder()).getAllByText('→')).toHaveLength(2)
  })

  it('excludes observers from the ring and lists them as 観戦', () => {
    renderWithProviders(<SeatLine seats={seatsFor({ observer: true })} n={3} />)
    expect(playerNames()).toEqual(['alice', 'bob', 'carol'])
    const watchers = screen.getByRole('list', { name: '観戦' })
    expect(within(watchers).getByText('dave')).toBeInTheDocument()
    expect(within(watchers).getByText('観戦')).toBeInTheDocument()
  })

  it('marks the active seat and puts the turn pointer under it', () => {
    const { container } = renderWithProviders(
      <SeatLine seats={seatsFor({ currentPlayer: 'p2' })} n={3} />,
    )
    const active = screen.getAllByRole('group').filter((g) => g.getAttribute('aria-current'))
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/^bob/)
    const pointers = container.querySelectorAll('[data-turn-pointer]')
    expect(pointers).toHaveLength(1)
    expect(pointers[0].closest('li')).toHaveAttribute('data-k', '1')
  })

  it('lights no seat when the turn lands on an observer', () => {
    const { container } = renderWithProviders(
      <SeatLine seats={seatsFor({ observer: true, currentPlayer: 'p4' })} n={3} />,
    )
    expect(screen.getAllByRole('group').some((g) => g.hasAttribute('aria-current'))).toBe(false)
    expect(container.querySelector('[data-turn-pointer]')).toBeNull()
    // the timer stays in place but shows no clock
    expect(screen.getByRole('timer')).toHaveTextContent('—')
  })

  it("shows the active seat's clock", () => {
    renderWithProviders(<SeatLine seats={seatsFor({ currentPlayer: 'p3', leftTime: 8 })} n={3} />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveAttribute('aria-valuenow', '8')
    expect(timer).toHaveAttribute('data-urgency', 'warn')
  })

  it('shows lead and passed markers from the model', () => {
    renderWithProviders(<SeatLine seats={seatsFor()} n={3} />)
    expect(screen.getByText('▲').closest('[data-seat]')).toHaveAccessibleName(/^bob/)
    expect(screen.getByText('∅').closest('[data-seat]')).toHaveAccessibleName(/^carol/)
  })

  it('never renders card faces', () => {
    renderWithProviders(<SeatLine seats={seatsFor()} n={3} />)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('reduced motion: static pointer, data-motion="reduced"', () => {
    const { container } = renderWithProviders(<SeatLine seats={seatsFor()} n={3} />, {
      reducedMotion: true,
    })
    expect(screen.getByRole('navigation')).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-turn-pointer]')).not.toBeNull()
  })
})
