/**
 * Characterization tests for GameBoard, written against the CURRENT implementation and
 * kept green through the redesign (ownership passes to T3, who may only update matchers).
 * Queries use roles and text with regexes that accept both the old English labels and the
 * new Japanese ones.
 */
import { partySocketControl } from '@/test-mocks/partysocket'
import { makeCtx, makeGameState, makePresence, renderWithProviders, serverMsg } from '@/test-utils'
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameBoard } from './game-board'

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
    const cta = await screen.findByRole('button', { name: /次のラウンド/ })
    expect(cta).toBeInTheDocument()
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GAME SET|Q\.E\.D|勝/).length).toBeGreaterThan(0)
  })
})
