/**
 * Characterization tests for GameBoard, written against the CURRENT implementation and
 * kept green through the redesign (ownership passes to T3, who may only update matchers).
 * Queries use roles and text with regexes that accept both the old English labels and the
 * new Japanese ones.
 */
import { partySocketControl } from '@/test-mocks/partysocket'
import { makeCtx, makeGameState, makePresence, renderWithProviders, serverMsg } from '@/test-utils'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { RoomChromeContext } from './RoomHeader'
import { GameBoard, TRAY_WIPE_MESSAGE } from './game-board'

vi.mock('partysocket/react', () => import('@/test-mocks/partysocket'))

const cookieGet = vi.hoisted(() => vi.fn(() => 'alice'))
vi.mock('js-cookie', () => ({
  default: { get: cookieGet, set: vi.fn(), remove: vi.fn() },
}))

const notificationsShow = vi.hoisted(() => vi.fn())
vi.mock('@mantine/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/notifications')>()
  return {
    ...actual,
    notifications: { ...actual.notifications, show: notificationsShow },
  }
})

const emit = (payload: unknown) => {
  act(() => {
    partySocketControl.last().__emit(payload)
  })
}

const sent = () => partySocketControl.last().sentPayloads as Record<string, unknown>[]
const passCount = () => sent().filter((p) => p.event === 'game' && p.action === 'pass').length

/**
 * Card options belonging to my hand. The redesigned board exposes a `listbox` named 手札;
 * the current board renders the hand as the last Paper of the board.
 */
const handOptions = (): HTMLElement[] => {
  const listbox = screen.queryByRole('listbox', { name: /手札|hand/i })
  if (listbox) {
    return within(listbox).queryAllByRole('option')
  }
  const papers = document.querySelectorAll<HTMLElement>('.mantine-Paper-root')
  const last = papers.item(papers.length - 1)
  return last ? within(last).queryAllByRole('option') : []
}

const startPlaying = ({
  selfStatus = 'ready',
  hands = { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH'] },
  currentPlayer = 'p1',
}: {
  selfStatus?: 'ready' | 'not-ready'
  hands?: Record<string, string[]>
  currentPlayer?: string
} = {}) => {
  const playOrder = Object.keys(hands)
  const presence = makePresence([
    { id: 'p1', name: 'alice', status: selfStatus },
    { id: 'p2', name: 'bob' },
    ...(hands.p3 ? [{ id: 'p3', name: 'carol' }] : []),
  ])
  emit(serverMsg.presence(presence))
  emit(serverMsg.roomStatus('playing'))
  const gameState = makeGameState({
    players: Object.fromEntries(
      Object.entries(hands).map(([id, hand]) => [id, { hand: hand as never }]),
    ),
  })
  const ctx = makeCtx({ playOrder, currentPlayer })
  emit(serverMsg.gameStart({ gameState, ctx, commander: { id: 'p1', name: 'alice' } }))
  return { gameState, ctx }
}

describe('GameBoard (characterization)', () => {
  beforeEach(() => {
    partySocketControl.reset()
    partySocketControl.nextId = 'p1'
    notificationsShow.mockClear()
  })
  afterEach(() => {
    partySocketControl.reset()
  })

  it('sends the cookie name on open', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    expect(sent()).toContainEqual({ event: 'set-name', name: 'alice' })
  })

  it('renders my hand after presence, room-status and game-start', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying()
    expect(handOptions()).toHaveLength(3)
    expect(screen.getByRole('button', { name: /パス|pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /出す|submit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /引く|draw/i })).toBeInTheDocument()
  })

  it('shows the waiting room while status is waiting', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    emit(serverMsg.presence(makePresence(['alice', 'bob'])))
    emit(serverMsg.roomStatus('waiting'))
    expect(screen.getByRole('button', { name: /ゲーム開始|start game/i })).toBeInTheDocument()
  })

  it('left-time 0 sends pass when I am the current player', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1' })
    expect(passCount()).toBe(0)
    emit(serverMsg.leftTime(3))
    expect(passCount()).toBe(0)
    emit(serverMsg.leftTime(0))
    expect(passCount()).toBe(1)
  })

  it('left-time 0 does not send pass when someone else is the current player', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    emit(serverMsg.leftTime(0))
    expect(passCount()).toBe(0)
  })

  it('an observer (not-ready) gets no hand', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({
      selfStatus: 'not-ready',
      hands: { p2: ['2S', '5C', 'KH'], p3: ['4S', '6C', 'QH'] },
      currentPlayer: 'p2',
    })
    expect(handOptions()).toHaveLength(0)
  })

  it('shows the GAME SET dialog after waitingNextRound', async () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying()
    emit(serverMsg.gameEnd({ winner: 'bob', commander: { id: 'p2', name: 'bob' } }))
    emit(serverMsg.roomStatus('waitingNextRound'))
    // the director holds the end for up to 800 ms (spec §9.3) before the dialog opens
    const cta = await screen.findByRole('button', { name: /次のラウンド/ }, { timeout: 2500 })
    expect(cta).toBeInTheDocument()
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GAME SET|Q\.E\.D|勝/).length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/* T3: director, shortcuts, tray wipe, chrome                          */
/* ------------------------------------------------------------------ */

const gameCount = (action: string) =>
  sent().filter((p) => p.event === 'game' && p.action === action).length
const press = (key: string, target: Element | Window = window) => {
  act(() => {
    fireEvent.keyDown(target, { key })
  })
}
/** Advance fake timers in steps so effects scheduled by each render get their turn. */
const advance = (ms: number, step = 50) => {
  for (let t = 0; t < ms; t += step) {
    act(() => {
      vi.advanceTimersByTime(Math.min(step, ms - t))
    })
  }
}
const gameSetCta = () => screen.queryByRole('button', { name: /次のラウンド/ })
const toastMessages = () =>
  notificationsShow.mock.calls.map(([arg]) => (arg as { message: unknown }).message)

describe('GameBoard (redesign)', () => {
  beforeEach(() => {
    partySocketControl.reset()
    partySocketControl.nextId = 'p1'
    notificationsShow.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    partySocketControl.reset()
  })

  describe('game end ordering (server sends game-end, room-status, then the winning submit)', () => {
    const finish = () => {
      const bob = { id: 'p2', name: 'bob' }
      const finalState = makeGameState({
        players: { p1: { hand: ['AS', '3H'] as never }, p2: { hand: [] } },
        field: [['KH']],
        deckTopPlayer: 'p2',
      })
      const ctx = makeCtx({ playOrder: ['p1', 'p2'], currentPlayer: 'p1' })
      emit(serverMsg.gameEnd({ winner: 'bob', gameState: finalState, ctx, commander: bob }))
      emit(serverMsg.roomStatus('waitingNextRound'))
      return { finalState, ctx, bob }
    }

    it('opens the GameSetDialog only after the winning submit has played', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      const { finalState, ctx, bob } = finish()
      advance(300)
      expect(gameSetCta()).toBeNull()

      emit(
        serverMsg.submit({
          gameState: finalState,
          ctx,
          commander: bob,
          submitCardSet: { submit: ['KH'], factor: [] },
        }),
      )
      expect(gameSetCta()).toBeNull()
      advance(1500)
      expect(gameSetCta()).toBeInTheDocument()
    })

    it('releases the dialog after 800 ms when no submit follows', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish()
      advance(750)
      expect(gameSetCta()).toBeNull()
      advance(1500) // the 800 ms hold, then the modal transition
      expect(gameSetCta()).toBeInTheDocument()
    })

    it('the next round CTA starts the game with the current rule', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish()
      advance(2000)
      const cta = gameSetCta()
      expect(cta).not.toBeNull()
      act(() => {
        fireEvent.click(cta as HTMLElement)
      })
      expect(sent()).toContainEqual(
        expect.objectContaining({ event: 'room', action: 'start-game' }),
      )
    })
  })

  describe('keyboard shortcuts (§9.5)', () => {
    it('D draws and P passes on my turn', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      press('d')
      expect(gameCount('draw')).toBe(1)
      press('P')
      expect(gameCount('pass')).toBe(1)
    })

    it('are ignored off turn and while typing in an input', () => {
      renderWithProviders(
        <>
          <input aria-label="chat" />
          <GameBoard id="room-1" />
        </>,
      )
      startPlaying({ currentPlayer: 'p2' })
      press('d')
      press('p')
      expect(gameCount('draw') + gameCount('pass')).toBe(0)

      emit(
        serverMsg.pass({
          gameState: makeGameState(),
          ctx: makeCtx({ playOrder: ['p1', 'p2'], currentPlayer: 'p1' }),
          commander: { id: 'p2', name: 'bob' },
        }),
      )
      press('d', screen.getByRole('textbox', { name: 'chat' }))
      expect(gameCount('draw')).toBe(0)
      press('d')
      expect(gameCount('draw')).toBe(1)
    })

    it('Enter submits the tray, Backspace returns the last card, Esc resets', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      const [first, second] = handOptions()
      fireEvent.click(first)
      fireEvent.click(handOptions()[0] ?? second)
      expect(handOptions()).toHaveLength(1)
      press('Backspace')
      expect(handOptions()).toHaveLength(2)
      press('Escape')
      expect(handOptions()).toHaveLength(3)

      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      const submits = sent().filter((p) => p.event === 'game' && p.action === 'submit')
      expect(submits).toHaveLength(1)
      expect(submits[0]).toMatchObject({ submitCardSet: { submit: ['AS'], factor: [] } })
    })

    it('a blocked submit keeps the original message and shakes the tray', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      emit(
        serverMsg.pass({
          gameState: makeGameState({
            players: { p1: { hand: ['AS', '3H', 'JD'] as never }, p2: { hand: ['2S'] as never } },
            field: [['KS', 'KH']],
          }),
          ctx: makeCtx({ playOrder: ['p1', 'p2'], currentPlayer: 'p1' }),
          commander: { id: 'p2', name: 'bob' },
        }),
      )
      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      expect(gameCount('submit')).toBe(0)
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '場のカードの数より大きくないといけません',
          color: 'red',
        }),
      )
    })
  })

  it('a server event that clears a non-empty tray shows the helper toast at most once per 5 s', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    const otherEvent = () =>
      emit(
        serverMsg.draw({
          gameState: makeGameState(),
          ctx: makeCtx({ playOrder: ['p1', 'p2'], currentPlayer: 'p2' }),
          commander: { id: 'p2', name: 'bob' },
        }),
      )
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(toastMessages().filter((m) => m === TRAY_WIPE_MESSAGE)).toHaveLength(1)
    // the tray was wiped: the card is back in the hand
    expect(handOptions()).toHaveLength(3)
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(toastMessages().filter((m) => m === TRAY_WIPE_MESSAGE)).toHaveLength(1)
  })

  it('an empty tray wipe is silent', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    emit(serverMsg.draw({ commander: { id: 'p2', name: 'bob' } }))
    expect(toastMessages()).not.toContain(TRAY_WIPE_MESSAGE)
  })

  it('logs rule changes as axiom diffs, not JSON', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    emit(serverMsg.presence(makePresence(['alice', 'bob'])))
    emit(serverMsg.roomStatus('waiting'))
    emit(serverMsg.changeRule({ timeLimit: 15 }))
    const { container } = render(<span>{logs.at(-1)}</span>)
    expect(container.textContent).toContain('t: 60 → 15 s')
    expect(container.textContent).not.toContain('{')
  })

  it('announces my turn in the live region', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1' })
    expect(document.querySelector('[data-live-region]')).toHaveTextContent('あなたの番です')
  })

  it('reports the room status and ring size to the room chrome', () => {
    const onBoardInfo = vi.fn()
    renderWithProviders(
      <RoomChromeContext.Provider value={{ onBoardInfo }}>
        <GameBoard id="room-1" size="L" />
      </RoomChromeContext.Provider>,
    )
    startPlaying()
    expect(onBoardInfo).toHaveBeenLastCalledWith({ status: 'playing', n: 2 })
    expect(document.querySelector('[data-card-size="L"]')).not.toBeNull()
  })

  describe('connection states', () => {
    it('shows the connecting ring while the socket connects', () => {
      partySocketControl.nextReadyState = 0
      renderWithProviders(<GameBoard id="room-1" />)
      expect(screen.getByText('接続中…')).toBeInTheDocument()
    })

    it('shows the waiting-for-sync state when playing without a game state', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      emit(serverMsg.presence(makePresence(['alice', 'bob'])))
      emit(serverMsg.roomStatus('playing'))
      expect(screen.getByText('次のイベントを待っています…')).toBeInTheDocument()
    })

    it('offers 再接続 when the socket is closed', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      act(() => {
        partySocketControl.last().__setReadyState(3)
      })
      expect(screen.getByRole('alert')).toHaveTextContent('接続が切れました')
      fireEvent.click(screen.getByRole('button', { name: '再接続' }))
      expect(partySocketControl.last().reconnect).toHaveBeenCalled()
    })
  })
})
