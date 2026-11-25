import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoomHeader } from './RoomHeader'

describe('RoomHeader', () => {
  it('shows the residue ring, room id, QR, size control and log button', () => {
    const onOpenLog = vi.fn()
    renderWithProviders(
      <RoomHeader
        roomId="1234"
        url="https://example.test/room/1234"
        size="M"
        onSizeChange={vi.fn()}
        onOpenLog={onOpenLog}
        n={4}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ℤ/4ℤRoom 1234')
    expect(screen.getByRole('button', { name: '招待用QRコード' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'カードの大きさ' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ログ/ }))
    expect(onOpenLog).toHaveBeenCalledOnce()
  })

  it('size control reports S / M / L', () => {
    const onSizeChange = vi.fn()
    renderWithProviders(<RoomHeader roomId="1" url={null} size="M" onSizeChange={onSizeChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'L' }))
    expect(onSizeChange).toHaveBeenCalledWith('L')
  })

  it('hides the QR until the url is known (SSR)', () => {
    renderWithProviders(<RoomHeader roomId="1" url={null} size="M" onSizeChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '招待用QRコード' })).toBeNull()
  })

  it('collapsed: only the log and ⋯ buttons; the menu holds the room controls', async () => {
    renderWithProviders(
      <RoomHeader
        roomId="1234"
        url="https://example.test/room/1234"
        size="S"
        onSizeChange={vi.fn()}
        onOpenLog={vi.fn()}
        n={3}
        collapsed={true}
      />,
    )
    expect(screen.queryByRole('heading')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '部屋メニュー' }))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Room 1234')
    expect(await screen.findByRole('switch', { name: 'カードの値を表示' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'テーマを切り替える' })).toBeInTheDocument()
  })

  it('value-chip toggle persists to localStorage', async () => {
    window.localStorage.removeItem('showCardValues')
    renderWithProviders(
      <RoomHeader roomId="1" url={null} size="M" onSizeChange={vi.fn()} collapsed={true} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '部屋メニュー' }))
    fireEvent.click(await screen.findByRole('switch', { name: 'カードの値を表示' }))
    expect(window.localStorage.getItem('showCardValues')).toBe('true')
  })
})
