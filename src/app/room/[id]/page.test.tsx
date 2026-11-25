import { partySocketControl } from '@/test-mocks/partysocket'
import { Providers, makePresence, renderWithProviders, serverMsg } from '@/test-utils'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'

vi.mock('partysocket/react', () => import('@/test-mocks/partysocket'))
vi.mock('js-cookie', () => ({ default: { get: vi.fn(() => 'alice'), set: vi.fn() } }))

const props = { params: { id: 'room-9' }, searchParams: {} }

describe('room page', () => {
  beforeEach(() => {
    partySocketControl.reset()
    window.localStorage.clear()
  })
  afterEach(() => partySocketControl.reset())

  it('renders on the server without touching window (renderToString)', () => {
    const html = renderToString(
      <Providers>
        <Page {...props} />
      </Providers>,
    )
    expect(html).toContain('room-9')
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
    act(() => {
      partySocketControl.last().__emit(serverMsg.presence(makePresence(['alice', 'bob'])))
      partySocketControl.last().__emit(serverMsg.roomStatus('playing'))
    })
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
      partySocketControl.last().__emit(serverMsg.presence(makePresence(['alice', 'bob'])))
      partySocketControl.last().__emit(serverMsg.roomStatus('playing'))
    })
    expect(document.querySelector('[data-room-header="collapsed"]')).not.toBeNull()
  })

  it('wide mode shows the proof log as a sidebar', () => {
    renderWithProviders(<Page {...props} />, {
      media: { '(min-width: 1280px) and (min-height: 720px)': true },
    })
    expect(document.querySelector('[data-proof-log="sidebar"]')).not.toBeNull()
  })
})
