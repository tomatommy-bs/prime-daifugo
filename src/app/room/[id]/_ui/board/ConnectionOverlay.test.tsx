import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionOverlay } from './ConnectionOverlay'

const surface = () => document.querySelector<HTMLElement>('[data-board-surface]') as HTMLElement

describe('ConnectionOverlay', () => {
  it('open: just the board, not desaturated', () => {
    renderWithProviders(
      <ConnectionOverlay state="open">
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByText('board')).toBeInTheDocument()
    expect(surface().style.filter).toBe('none')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('connecting: a spinning ModRing with 接続中… over the desaturated board', () => {
    renderWithProviders(
      <ConnectionOverlay state="connecting">
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByText('接続中…')).toBeInTheDocument()
    expect(document.querySelector('svg[data-spin="true"]')).not.toBeNull()
    expect(surface().style.filter).toBe('grayscale(.6)')
  })

  it('waiting-sync explains the missing state', () => {
    renderWithProviders(
      <ConnectionOverlay state="waiting-sync">
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByText('次のイベントを待っています…')).toBeInTheDocument()
  })

  it.each(['closed', 'error'] as const)('%s: an alert with 再接続', (state) => {
    const onReconnect = vi.fn()
    renderWithProviders(
      <ConnectionOverlay state={state} onReconnect={onReconnect}>
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('接続が切れました')
    fireEvent.click(screen.getByRole('button', { name: '再接続' }))
    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('reduced motion: no spinning ring', () => {
    renderWithProviders(
      <ConnectionOverlay state="connecting">
        <p>board</p>
      </ConnectionOverlay>,
      { reducedMotion: true },
    )
    expect(document.querySelector('[data-connection]')).toHaveAttribute('data-motion', 'reduced')
    expect(document.querySelector('svg[data-spin="true"]')).toBeNull()
  })
})
