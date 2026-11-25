import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderWithProviders } from '@/test-utils'
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './page'

/** Minimal stand-in for the browser WebSocket, installed as the global for these tests. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  readonly close = vi.fn()

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1)
    if (!ws) {
      throw new Error('no lobby socket')
    }
    return ws
  }

  emit(body: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(body) }))
  }
}

const COMPACT = '(orientation: landscape) and (max-height: 500px)'
const PORTRAIT = '(orientation: portrait) and (max-width: 600px)'

const counter = (container: HTMLElement, key: string) => {
  const el = container.querySelector<HTMLElement>(`[data-counter="${key}"]`)
  if (!el) {
    throw new Error(`counter ${key} not found`)
  }
  return el
}

describe('Home page', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    window.sessionStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to the realtime lobby socket', () => {
    renderWithProviders(<Home />)
    expect(FakeWebSocket.last().url).toBe('ws://127.0.0.1:8787/lobby')
  })

  it('no longer imports partysocket', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).not.toMatch(/partysocket/)
  })

  it('shows — for every counter before the first lobby message', () => {
    const { container } = renderWithProviders(<Home />)
    for (const key of ['online', 'lobby', 'rooms']) {
      expect(within(counter(container, key)).getByText('—')).toBeInTheDocument()
    }
    expect(within(counter(container, 'online')).getByText('オンライン')).toBeInTheDocument()
  })

  it('shows the counts after a lobby message', () => {
    const { container } = renderWithProviders(<Home />)
    act(() => {
      FakeWebSocket.last().emit({ t: 'lobby', lobby: 3, room: { a: 2, b: 4 } })
    })
    // online = 2 + 4 + 3, lobby = 3, rooms = 2
    expect(within(counter(container, 'online')).getByText('9', { selector: '.sr-only' }))
    expect(within(counter(container, 'lobby')).getByText('3', { selector: '.sr-only' }))
    expect(within(counter(container, 'rooms')).getByText('2', { selector: '.sr-only' }))
    expect(within(counter(container, 'online')).queryByText('—')).not.toBeInTheDocument()
  })

  it('keeps — for frames that are not lobby stats', () => {
    const { container } = renderWithProviders(<Home />)
    act(() => {
      FakeWebSocket.last().emit({ lobby: 3, room: { a: 2 } })
    })
    expect(within(counter(container, 'online')).getByText('—')).toBeInTheDocument()
  })

  it('shows the counts in compact mode too', () => {
    const { container } = renderWithProviders(<Home />, { media: { [COMPACT]: true } })
    act(() => {
      FakeWebSocket.last().emit({ t: 'lobby', lobby: 0, room: { a: 1 } })
    })
    expect(within(counter(container, 'online')).getByText('1', { selector: '.sr-only' }))
    expect(within(counter(container, 'rooms')).getByText('1', { selector: '.sr-only' }))
  })

  it('renders the hero title', () => {
    renderWithProviders(<Home />)
    expect(screen.getByRole('heading', { level: 1, name: '素数大富豪' })).toBeInTheDocument()
  })

  it('links ルーム作成 to /room/new and the lab to /labo/calc', () => {
    renderWithProviders(<Home />)
    expect(screen.getByRole('link', { name: /ルーム作成/ })).toHaveAttribute('href', '/room/new')
    expect(screen.getByRole('link', { name: /素数判定ラボ/ })).toHaveAttribute('href', '/labo/calc')
  })

  it('renders disabled features as disabled buttons that are not links', () => {
    renderWithProviders(<Home />)
    for (const name of [/ランダムマッチ/, /トレーニング/]) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button.closest('a')).toBeNull()
    }
    expect(screen.queryByRole('link', { name: /ランダムマッチ|トレーニング/ })).toBeNull()
    expect(document.querySelector('a[href="/room/random"]')).toBeNull()
    expect(document.querySelector('a[href="/labo/training"]')).toBeNull()
  })

  it('keeps the external URLs unchanged', () => {
    renderWithProviders(<Home />)
    expect(screen.getByRole('link', { name: /ゲームルール/ })).toHaveAttribute(
      'href',
      'https://primeqk.themedia.jp/pages/4500251/rules',
    )
    expect(screen.getByRole('link', { name: /フィードバック/ })).toHaveAttribute(
      'href',
      'https://forms.gle/1Aaexb2zNy39nPPF8',
    )
    expect(screen.getByRole('link', { name: /更新履歴/ })).toHaveAttribute(
      'href',
      'https://tomatommy.notion.site/Prime-Daifugo-1fa4870920958036adabf9f4a7185fa2',
    )
    expect(screen.getByRole('link', { name: /X/ })).toHaveAttribute(
      'href',
      'https://x.com/TomaTommy123',
    )
  })

  it('uses the golden two-column split in compact mode', () => {
    const { container } = renderWithProviders(<Home />, { media: { [COMPACT]: true } })
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('data-layout', 'compact')
    const grid = main?.firstElementChild as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('0.618fr')
    expect(container.querySelector('[data-hero-strip="compact"]')).toBeInTheDocument()
  })

  it('uses a single column in portrait', () => {
    const { container } = renderWithProviders(<Home />, { media: { [PORTRAIT]: true } })
    expect(container.querySelector('main')).toHaveAttribute('data-layout', 'portrait')
    expect(container.querySelector('[data-hero-strip="portrait"]')).toBeInTheDocument()
  })

  it('plays the intro once per session', () => {
    const first = renderWithProviders(<Home />, { reducedMotion: false })
    expect(first.container.querySelector('[data-intro]')).toHaveAttribute('data-intro', 'play')
    expect(window.sessionStorage.getItem('introPlayed')).toBe('true')
    first.unmount()
    const second = renderWithProviders(<Home />, { reducedMotion: false })
    expect(second.container.querySelector('[data-intro]')).toHaveAttribute('data-intro', 'static')
  })
})
