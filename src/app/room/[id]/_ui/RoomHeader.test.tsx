import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

  describe('退出 (onLeave)', () => {
    it('has no 退出 button without onLeave', () => {
      renderWithProviders(<RoomHeader roomId="1" url={null} size="M" onSizeChange={vi.fn()} />)
      expect(screen.queryByRole('button', { name: '退出' })).toBeNull()
    })

    it('asks for confirmation before calling onLeave', async () => {
      const onLeave = vi.fn()
      renderWithProviders(
        <RoomHeader roomId="1" url={null} size="M" onSizeChange={vi.fn()} onLeave={onLeave} />,
      )
      fireEvent.click(screen.getByRole('button', { name: '退出' }))
      const dialog = await screen.findByRole('dialog', { name: '部屋から退出しますか？' })
      expect(onLeave).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole('button', { name: '退出する' }))
      expect(onLeave).toHaveBeenCalledOnce()
    })

    it('cancelling the dialog does not leave', async () => {
      const onLeave = vi.fn()
      renderWithProviders(
        <RoomHeader roomId="1" url={null} size="M" onSizeChange={vi.fn()} onLeave={onLeave} />,
      )
      fireEvent.click(screen.getByRole('button', { name: '退出' }))
      const dialog = await screen.findByRole('dialog', { name: '部屋から退出しますか？' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(onLeave).not.toHaveBeenCalled()
    })

    it('collapsed: 退出 sits in the ⋯ menu and still confirms', async () => {
      const onLeave = vi.fn()
      renderWithProviders(
        <RoomHeader
          roomId="1"
          url={null}
          size="M"
          onSizeChange={vi.fn()}
          collapsed={true}
          onLeave={onLeave}
        />,
      )
      expect(screen.queryByRole('button', { name: '退出' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '部屋メニュー' }))
      fireEvent.click(await screen.findByRole('button', { name: '退出' }))
      const dialog = await screen.findByRole('dialog', { name: '部屋から退出しますか？' })
      fireEvent.click(within(dialog).getByRole('button', { name: '退出する' }))
      expect(onLeave).toHaveBeenCalledOnce()
    })
  })
})
