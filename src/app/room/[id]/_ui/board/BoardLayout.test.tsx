import { makePresence, renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardLayout, BoardTopBar, GRID, gridStyle } from './BoardLayout'
import type { LayoutMode, SeatModel } from './types'

const slots = {
  top: <span>TOP</span>,
  deck: <span>DECK</span>,
  field: <span>FIELD</span>,
  tray: <span>TRAY</span>,
  actions: <span>ACTIONS</span>,
  hand: <span>HAND</span>,
}

const root = () => document.querySelector<HTMLElement>('[data-board-layout]') as HTMLElement

describe('BoardLayout', () => {
  it('compact grid matches §7.5 exactly', () => {
    renderWithProviders(<BoardLayout mode="compact" {...slots} />)
    const s = root().style
    expect(s.gridTemplateColumns).toBe('72px minmax(0, 1fr) 168px')
    expect(s.gridTemplateRows).toBe('36px 132px 76px 128px')
    expect(s.gridTemplateAreas).toBe(
      '"top top top" "deck field rail" "reset tray rail" "hand hand hand"',
    )
  })

  it('compact budget fits 390px: 36 + 132 + 76 + 128 + 3 × 4 gaps = 384', () => {
    const rows = GRID.compact.rows.split(' ').map((r) => Number.parseInt(r, 10))
    expect(rows.reduce((a, b) => a + b, 0) + 3 * 4).toBe(384)
    expect(GRID.compact.rowGap).toBe('var(--sp-1)')
  })

  it('factor mode swaps the field and tray rows with a transition (384px budget kept)', () => {
    renderWithProviders(<BoardLayout mode="compact" factorOpen={true} {...slots} />)
    expect(root().style.gridTemplateRows).toBe('36px 64px 144px 128px')
    expect(root()).toHaveAttribute('data-factor', 'true')
    // the field shrinks to mini cards and the tray condenses so the panel fits
    expect(root().style.getPropertyValue('--card-field')).toContain('44px')
    expect(root().style.getPropertyValue('--card-tray')).toContain('38px')
    expect(gridStyle('compact', true, false).transition).toContain('grid-template-rows')
  })

  it.each<LayoutMode>(['compact', 'regular', 'portrait', 'wide'])(
    '%s renders every slot',
    (mode) => {
      renderWithProviders(<BoardLayout mode={mode} {...slots} />)
      for (const text of ['TOP', 'DECK', 'FIELD', 'TRAY', 'ACTIONS', 'HAND']) {
        expect(screen.getByText(text)).toBeInTheDocument()
      }
      expect(root()).toHaveAttribute('data-board-layout', mode)
    },
  )

  it('wide uses the 320px log column when a log is given', () => {
    renderWithProviders(<BoardLayout mode="wide" {...slots} log={<span>LOG</span>} />)
    expect(root().style.gridTemplateColumns).toBe('minmax(0, 1fr) 320px')
    expect(root().style.gridTemplateRows).toBe('52px minmax(0, 1fr) auto auto')
    expect(root().style.gridTemplateAreas).toBe('"top log" "table log" "tray log" "hand log"')
    expect(screen.getByText('LOG').closest('[data-area="log"]')).not.toBeNull()
  })

  it('portrait puts the actions in a 55px bottom row', () => {
    renderWithProviders(<BoardLayout mode="portrait" {...slots} />)
    expect(root().style.gridTemplateRows.endsWith('55px')).toBe(true)
    expect(root().style.gridTemplateAreas).toContain('"rail rail"')
  })

  it('an optional reset cell takes the reset area; otherwise the tray spans it', () => {
    const { unmount } = renderWithProviders(<BoardLayout mode="compact" {...slots} />)
    const tray = document.querySelector<HTMLElement>('[data-area="tray"]') as HTMLElement
    expect(tray.style.gridColumn).toBe('1 / 3')
    unmount()
    renderWithProviders(<BoardLayout mode="compact" {...slots} reset={<span>RESET</span>} />)
    expect(screen.getByText('RESET').closest('[data-area="reset"]')).not.toBeNull()
  })

  it('marks motion mode', () => {
    renderWithProviders(<BoardLayout mode="compact" {...slots} />, { reducedMotion: true })
    expect(root()).toHaveAttribute('data-motion', 'reduced')
  })
})

describe('BoardTopBar', () => {
  const seats: SeatModel[] = makePresence(['alice', 'bob']).map((p, k) => ({
    id: p.id,
    name: p.name,
    handCount: 3,
    hueIndex: k,
    k,
    isSelf: k === 0,
    isActive: k === 1,
    isLead: false,
    passed: false,
    observer: false,
  }))

  it('shows the SeatLine outside wide', () => {
    renderWithProviders(
      <BoardTopBar mode="compact" seats={seats} n={2} timer={<span>T</span>} isMyTurn={false} />,
    )
    expect(document.querySelector('[data-top-bar="seats"]')).not.toBeNull()
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0)
  })

  it('wide shows a one-line status with whose turn it is', () => {
    renderWithProviders(
      <BoardTopBar mode="wide" seats={seats} n={2} timer={<span>T</span>} isMyTurn={false} />,
    )
    expect(screen.getByText('ℤ/2ℤ')).toBeInTheDocument()
    expect(screen.getByText('bob の番')).toBeInTheDocument()
  })

  it('draws its own timer only when no seat carries the clock', () => {
    const { rerender } = renderWithProviders(
      <BoardTopBar mode="compact" seats={seats} n={2} timer={<span>T</span>} isMyTurn={false} />,
    )
    expect(screen.getByText('T')).toBeInTheDocument()
    const timed = seats.map((s) => ({ ...s, leftTime: 30, timeLimit: 60 }))
    rerender(
      <BoardTopBar mode="compact" seats={timed} n={2} timer={<span>T</span>} isMyTurn={false} />,
    )
    expect(screen.queryByText('T')).toBeNull()
    rerender(
      <BoardTopBar mode="wide" seats={timed} n={2} timer={<span>T</span>} isMyTurn={false} />,
    )
    // wide: only the active seat's node draws a clock
    const anyActive = timed.some((s) => s.isActive)
    expect(screen.queryByText('T') === null).toBe(anyActive)
  })

  it('wide says あなたの番です on my turn', () => {
    renderWithProviders(
      <BoardTopBar mode="wide" seats={seats} n={2} timer={null} isMyTurn={true} />,
    )
    expect(screen.getByText('あなたの番です')).toBeInTheDocument()
  })
})
