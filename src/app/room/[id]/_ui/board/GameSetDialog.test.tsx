import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameSetDialog, type GameSetDialogProps, QED, sortStandings } from './GameSetDialog'

const props = (partial: Partial<GameSetDialogProps> = {}): GameSetDialogProps => ({
  opened: true,
  winner: 'bob',
  standings: [
    { name: 'alice', handCount: 3 },
    { name: 'bob', handCount: 0 },
    { name: 'carol', handCount: 5 },
    { name: 'dave', handCount: 1 },
  ],
  onNextRound: vi.fn(),
  ...partial,
})

describe('sortStandings', () => {
  it('orders by cards left, stable on ties', () => {
    expect(
      sortStandings([
        { name: 'a', handCount: 3 },
        { name: 'b', handCount: 0 },
        { name: 'c', handCount: 3 },
      ]).map((s) => s.name),
    ).toEqual(['b', 'a', 'c'])
  })
})

describe('GameSetDialog', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<GameSetDialog {...props({ opened: false })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('states the theorem and the proof for the winner', async () => {
    renderWithProviders(<GameSetDialog {...props()} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('GAME SET')).toBeInTheDocument()
    expect(within(dialog).getByText('Theorem.')).toBeInTheDocument()
    expect(within(dialog).getByText('Proof.')).toBeInTheDocument()
    const theorem = dialog.querySelector('[data-theorem]') as HTMLElement
    expect(theorem).toHaveTextContent('bob の勝ち。')
    const proof = dialog.querySelector('[data-proof]') as HTMLElement
    expect(proof).toHaveTextContent('|Hbob| = 0.')
    expect(proof.querySelector('sub')).toHaveTextContent('bob')
  })

  it('lists the standings, winner first', async () => {
    renderWithProviders(<GameSetDialog {...props()} />)
    const table = await screen.findByRole('table', { name: '残り手札' })
    const rows = within(table).getAllByRole('row').slice(1) // skip the header row
    expect(rows.map((r) => r.textContent)).toEqual(['bob0', 'dave1', 'alice3', 'carol5'])
    expect(rows[0]).toHaveAttribute('data-winner', 'true')
  })

  it('shows the Q.E.D. ∎ stamp', async () => {
    renderWithProviders(<GameSetDialog {...props()} />)
    expect(await screen.findByText(QED)).toHaveAttribute('data-qed')
    expect(QED).toBe('Q.E.D. ∎')
  })

  it('CTA calls onNextRound', async () => {
    const onNextRound = vi.fn()
    renderWithProviders(<GameSetDialog {...props({ onNextRound })} />)
    fireEvent.click(await screen.findByRole('button', { name: /次のラウンドを開始/ }))
    expect(onNextRound).toHaveBeenCalledTimes(1)
  })

  it('CTA disabled when the round cannot start', async () => {
    const onNextRound = vi.fn()
    renderWithProviders(<GameSetDialog {...props({ onNextRound, canStart: false })} />)
    const cta = await screen.findByRole('button', { name: /次のラウンドを開始/ })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(onNextRound).not.toHaveBeenCalled()
  })

  it('tap skips the ceremony to its final state', async () => {
    renderWithProviders(<GameSetDialog {...props()} />, { reducedMotion: false })
    const body = (await screen.findByRole('dialog')).querySelector('[data-game-set]') as HTMLElement
    expect(body).not.toHaveAttribute('data-skipped')
    fireEvent.click(body)
    expect(body).toHaveAttribute('data-skipped', 'true')
    expect(screen.getByText(QED)).toBeInTheDocument()
  })

  it('Esc skips the ceremony but keeps the dialog open', async () => {
    const onNextRound = vi.fn()
    renderWithProviders(<GameSetDialog {...props({ onNextRound })} />)
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog.querySelector('[data-game-set]')).toHaveAttribute('data-skipped', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onNextRound).not.toHaveBeenCalled()
  })

  it('shows the number of plays when given', async () => {
    renderWithProviders(<GameSetDialog {...props({ plays: 23 })} />)
    expect(await screen.findByText(/証明の長さ/)).toHaveTextContent('証明の長さ: 23 手')
  })

  it('no winner renders a placeholder', async () => {
    renderWithProviders(<GameSetDialog {...props({ winner: null })} />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('[data-theorem]')).toHaveTextContent('— の勝ち。')
  })

  it('content is present on the same render that opens it (director timing)', () => {
    const { rerender } = renderWithProviders(<GameSetDialog {...props({ opened: false })} />)
    expect(screen.queryByRole('button', { name: /次のラウンドを開始/ })).toBeNull()
    rerender(<GameSetDialog {...props({ opened: true })} />)
    expect(screen.getByRole('button', { name: /次のラウンドを開始/ })).toBeInTheDocument()
  })

  it('unmounts after the exit transition when closed', async () => {
    const { rerender } = renderWithProviders(<GameSetDialog {...props()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    rerender(<GameSetDialog {...props({ opened: false })} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('data-motion follows reduced motion', async () => {
    renderWithProviders(<GameSetDialog {...props()} />, { reducedMotion: true })
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('[data-game-set]')).toHaveAttribute('data-motion', 'reduced')
  })
})
