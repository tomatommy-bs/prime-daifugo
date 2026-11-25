import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionOverlay } from './ConnectionOverlay'

const HOME_LINK = /ホームへ/

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

  it('superseded: 別のタブで開かれています with このタブで再開 calling onReconnect', () => {
    const onReconnect = vi.fn()
    renderWithProviders(
      <ConnectionOverlay state="closed" reason="superseded" onReconnect={onReconnect}>
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('別のタブで開かれています')
    expect(screen.queryByText('接続が切れました')).toBeNull()
    expect(screen.queryByRole('button', { name: '再接続' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'このタブで再開' }))
    expect(onReconnect).toHaveBeenCalledOnce()
    expect(surface().style.filter).toBe('grayscale(.6)')
  })

  it('room-gone: この部屋は閉じられました with a link home', () => {
    renderWithProviders(
      <ConnectionOverlay state="closed" reason="room-gone">
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('この部屋は閉じられました')
    expect(screen.getByRole('link', { name: HOME_LINK })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: '再接続' })).toBeNull()
  })

  it('a terminal reason also replaces the error copy', () => {
    renderWithProviders(
      <ConnectionOverlay state="error" reason="superseded">
        <p>board</p>
      </ConnectionOverlay>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('別のタブで開かれています')
  })

  it.each([null, undefined, 'left', 'room-full', 'bad-name', 'upgrade-required'] as const)(
    'reason %s keeps the default closed copy',
    (reason) => {
      renderWithProviders(
        <ConnectionOverlay state="closed" reason={reason}>
          <p>board</p>
        </ConnectionOverlay>,
      )
      expect(screen.getByRole('alert')).toHaveTextContent('接続が切れました')
      expect(screen.getByRole('button', { name: '再接続' })).toBeInTheDocument()
    },
  )

  it.each(['open', 'connecting', 'waiting-sync'] as const)(
    'a reason is ignored while %s (only closed / error are terminal)',
    (state) => {
      renderWithProviders(
        <ConnectionOverlay state={state} reason="superseded">
          <p>board</p>
        </ConnectionOverlay>,
      )
      expect(screen.queryByText('別のタブで開かれています')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

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
