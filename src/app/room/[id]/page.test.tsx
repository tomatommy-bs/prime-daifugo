import type { ClientGameStateBundle } from '@/shared/client-state'
import { roomSession } from '@/test-mocks/room-session'
import { Providers, makeClientBundle, makeSessionPresence, renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'

vi.mock('@/app/room/[id]/session/use-room-session', () => import('@/test-mocks/room-session'))
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}))

const props = { params: { id: 'room-9' }, searchParams: {} }

const startGame = (next: ClientGameStateBundle = makeClientBundle()) => {
  act(() => {
    roomSession.setSession({
      presence: makeSessionPresence(['alice', 'bob']),
      roomStatus: 'playing',
    })
    roomSession.emitTransition({
      prev: null,
      next,
      msg: { action: 'game-start', commander: { id: 'p1', name: 'alice' } },
      event: { type: 'game-started', by: 'p1', round: 1 },
    })
  })
}

describe('room page', () => {
  beforeEach(() => {
    roomSession.reset({ selfId: 'p1' })
    routerPush.mockClear()
    window.localStorage.clear()
  })

  it('renders on the server without touching window (renderToString)', () => {
    const html = renderToString(
      <Providers>
        <Page {...props} />
      </Providers>,
    )
    expect(html).toContain('room-9')
  })

  it('opens the session for the room id', () => {
    renderWithProviders(<Page {...props} />)
    expect(roomSession.roomIds).toEqual(['room-9'])
  })

  it('cardSizeOption drives data-card-size', async () => {
    window.localStorage.setItem('cardSizeOption', JSON.stringify('L'))
    renderWithProviders(<Page {...props} />)
    await vi.waitFor(() => expect(document.querySelector('[data-card-size="L"]')).not.toBeNull())
    fireEvent.click(screen.getByRole('radio', { name: 'S' }))
    expect(document.querySelector('[data-card-size="S"]')).not.toBeNull()
    expect(window.localStorage.getItem('cardSizeOption')).toBe('"S"')
  })

  it('shows the invite QR once the URL is read on the client', () => {
    renderWithProviders(<Page {...props} />)
    expect(screen.getByRole('button', { name: '招待用QRコード' })).toBeInTheDocument()
  })

  it('collects board notifications into the proof log (L toggles the drawer)', async () => {
    renderWithProviders(<Page {...props} />)
    startGame()
    fireEvent.keyDown(window, { key: 'l' })
    expect(await screen.findByText('ゲームを開始します')).toBeInTheDocument()
    expect(screen.getByText(/ここにログが表示されます/)).toBeInTheDocument()
  })

  it('collapses the header during play on compact screens', () => {
    renderWithProviders(<Page {...props} />, {
      media: { '(orientation: landscape) and (max-height: 500px)': true },
    })
    expect(document.querySelector('[data-room-header="full"]')).not.toBeNull()
    act(() => {
      roomSession.setSession({
        presence: makeSessionPresence(['alice', 'bob']),
        roomStatus: 'playing',
      })
    })
    expect(document.querySelector('[data-room-header="collapsed"]')).not.toBeNull()
  })

  it('wide mode shows the proof log as a sidebar', () => {
    renderWithProviders(<Page {...props} />, {
      media: { '(min-width: 1280px) and (min-height: 720px)': true },
    })
    expect(document.querySelector('[data-proof-log="sidebar"]')).not.toBeNull()
  })

  it('退出: confirm, leave the session, then go home (spec §3.6)', async () => {
    let resolveLeave: () => void = () => undefined
    roomSession.actions.leave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLeave = resolve
        }),
    )
    renderWithProviders(<Page {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    const dialog = await screen.findByRole('dialog', { name: '部屋から退出しますか？' })
    expect(roomSession.actions.leave).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '退出する' }))
    expect(roomSession.actions.leave).toHaveBeenCalledOnce()
    // navigation waits for the leave (ack + bye) so the server sees it first
    expect(routerPush).not.toHaveBeenCalled()
    await act(async () => resolveLeave())
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'))
  })

  it('cancelling 退出 neither leaves nor navigates', async () => {
    renderWithProviders(<Page {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    const dialog = await screen.findByRole('dialog', { name: '部屋から退出しますか？' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '部屋から退出しますか？' })).toBeNull(),
    )
    expect(roomSession.actions.leave).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
