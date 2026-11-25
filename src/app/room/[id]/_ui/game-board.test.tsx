/**
 * GameBoard wired to the room session (rebuild spec §9.2). The session is the controllable
 * fake in `@/test-mocks/room-session`; queries use roles and text, as before the rebuild.
 */
import type { SessionPresence, SessionTransition } from '@/app/room/[id]/session/types'
import type { ClientGameStateBundle, SystemMessage } from '@/shared/client-state'
import type { RoomEvent } from '@/shared/protocol'
import { roomSession } from '@/test-mocks/room-session'
import {
  DEFAULT_RULE,
  makeClientBundle,
  makeSessionPresence,
  renderWithProviders,
} from '@/test-utils'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomChromeContext } from './RoomHeader'
import {
  GAME_START_MESSAGE,
  GameBoard,
  SUBMIT_REJECT_FALLBACK,
  SUBMIT_REJECT_MESSAGES,
  TIMEOUT_MESSAGE,
  TRAY_WIPE_MESSAGE,
  submitRejectMessage,
} from './game-board'

vi.mock('@/app/room/[id]/session/use-room-session', () => import('@/test-mocks/room-session'))

const notificationsShow = vi.hoisted(() => vi.fn())
vi.mock('@mantine/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/notifications')>()
  return {
    ...actual,
    notifications: { ...actual.notifications, show: notificationsShow },
  }
})

const SELF = 'p1'
const alice = { id: 'p1', name: 'alice' }
const bob = { id: 'p2', name: 'bob' }

type Hands = Record<string, string[]>

/** A UI bundle: my hand in full, the others' hands as counts only (RQ-S16). */
const bundle = ({
  hands = { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH'] } as Hands,
  currentPlayer,
  playOrder,
  field = [] as string[][],
  deckTopPlayer = null as string | null,
  winner = null as string | null,
  drawRight = true,
  deadline = null as number | null,
  turn = 0,
}: {
  hands?: Hands
  currentPlayer?: string
  playOrder?: string[]
  field?: string[][]
  deckTopPlayer?: string | null
  winner?: string | null
  drawRight?: boolean
  deadline?: number | null
  turn?: number
} = {}): ClientGameStateBundle => {
  const order = playOrder ?? Object.keys(hands)
  return makeClientBundle({
    gameState: {
      players: Object.fromEntries(
        Object.entries(hands).map(([id, hand]) => [
          id,
          id === SELF
            ? { hand: hand as never, drawRight }
            : { hand: [], handCount: hand.length, drawRight: true },
        ]),
      ),
      field: field as never,
      deckTopPlayer,
      winner,
    },
    ctx: { playOrder: order, currentPlayer: currentPlayer ?? order[0], deadline, turn },
  })
}

const set = (partial: Parameters<typeof roomSession.setSession>[0]) => {
  act(() => {
    roomSession.setSession(partial)
  })
}

/** Deliver one transition; `prev` is the session's current game. */
const emit = (
  msg: SessionTransition['msg'],
  next: ClientGameStateBundle,
  {
    event = null,
    patch = {},
  }: { event?: RoomEvent | null; patch?: Parameters<typeof roomSession.setSession>[0] } = {},
) => {
  act(() => {
    roomSession.emitTransition({ prev: roomSession.current.game, next, msg, event }, patch)
  })
}

const msgs = {
  gameStart: (commander = alice): SystemMessage => ({ action: 'game-start', commander }),
  draw: (commander = bob): SystemMessage => ({ action: 'draw', commander }),
  pass: (commander = bob, reason: 'manual' | 'timeout' = 'manual'): SystemMessage => ({
    action: 'pass',
    commander,
    reason,
  }),
  submit: (
    commander: { id: string; name: string },
    submit: string[],
    result: 'BASE_IS_NOT_PRIME' | null = null,
    factor: string[] = [],
  ): SystemMessage => ({
    action: 'submit',
    commander,
    submissionResult: { submitCardSet: { submit, factor } as never, result },
  }),
  gameEnd: (winner = bob): SystemMessage => ({
    action: 'game-end',
    winner: winner.name,
    winnerId: winner.id,
  }),
}

/**
 * Card options belonging to my hand: the redesigned board exposes a `listbox` named 手札.
 */
const handOptions = (): HTMLElement[] => {
  const listbox = screen.queryByRole('listbox', { name: /手札|hand/i })
  return listbox ? within(listbox).queryAllByRole('option') : []
}

const startPlaying = ({
  selfRole = 'player',
  hands = { p1: ['AS', '3H', 'JD'], p2: ['2S', '5C', 'KH'] } as Hands,
  currentPlayer = 'p1',
  presence,
}: {
  selfRole?: 'player' | 'observer'
  hands?: Hands
  currentPlayer?: string
  presence?: SessionPresence[]
} = {}) => {
  set({
    presence:
      presence ??
      makeSessionPresence([
        { id: 'p1', name: 'alice', role: selfRole },
        { id: 'p2', name: 'bob', role: 'p2' in hands ? 'player' : 'observer' },
        ...(hands.p3 ? [{ id: 'p3', name: 'carol' }] : []),
      ]),
    roomStatus: 'playing',
  })
  const next = bundle({ hands, currentPlayer })
  emit(msgs.gameStart(), next, { event: { type: 'game-started', by: 'p1', round: 1 } })
  return next
}

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
const gameSetCta = () => screen.queryByRole('button', { name: /次のラウンドを開始/ })
const toastMessages = () =>
  notificationsShow.mock.calls.map(([arg]) => (arg as { message: unknown }).message)
const textOf = (node: ReactNode) => render(<span>{node}</span>).container.textContent ?? ''

beforeEach(() => {
  roomSession.reset({ selfId: SELF })
  notificationsShow.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('GameBoard (session wiring)', () => {
  it('subscribes to the session of its room id', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    expect(roomSession.roomIds).toEqual(['room-1'])
    expect(roomSession.listenerCount).toBe(1)
  })

  it('renders my hand after presence, room status and game start', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying()
    expect(handOptions()).toHaveLength(3)
    expect(screen.getByRole('button', { name: /パス|pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /出す|submit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /引く|draw/i })).toBeInTheDocument()
  })

  it('shows the waiting room while status is waiting', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({ presence: makeSessionPresence(['alice', 'bob']), roomStatus: 'waiting' })
    expect(screen.getByRole('button', { name: /ゲーム開始|start game/i })).toBeInTheDocument()
  })

  it('ゲーム開始 calls startGame (the server uses its stored rule)', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({ presence: makeSessionPresence(['alice', 'bob']), roomStatus: 'waiting' })
    fireEvent.click(screen.getByRole('button', { name: /ゲーム開始/ }))
    expect(roomSession.actions.startGame).toHaveBeenCalledOnce()
    expect(roomSession.actions.startGame).toHaveBeenCalledWith()
  })

  it('ready and unready in the waiting room go to setReady / unsetReady', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({
      presence: makeSessionPresence([{ name: 'alice', status: 'not-ready' }, 'bob']),
      roomStatus: 'waiting',
    })
    fireEvent.click(screen.getByRole('button', { name: /準備OK/ }))
    expect(roomSession.actions.setReady).toHaveBeenCalledOnce()
    set({ presence: makeSessionPresence(['alice', 'bob']) })
    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    expect(roomSession.actions.unsetReady).toHaveBeenCalledOnce()
  })

  it('a rule change sends only the patch and shows the server-stored rule', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({ presence: makeSessionPresence(['alice']), roomStatus: 'waiting' })
    fireEvent.click(screen.getByRole('radio', { name: '15' }))
    expect(roomSession.actions.changeRule).toHaveBeenCalledWith({ timeLimit: 15 })
    // nothing changes locally until the server stores it
    expect(screen.getByRole('radio', { name: '15' })).not.toBeChecked()
    set({ rule: { ...DEFAULT_RULE, timeLimit: 15 } })
    expect(screen.getByRole('radio', { name: '15' })).toBeChecked()
  })

  it('the waiting room disables ゲーム開始 while a ready member is disconnected', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({
      presence: makeSessionPresence(['alice', { name: 'bob', connected: false }]),
      roomStatus: 'waiting',
    })
    expect(screen.getByRole('button', { name: /ゲーム開始/ })).toBeDisabled()
  })

  it('an observer gets no hand', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({
      selfRole: 'observer',
      hands: { p2: ['2S', '5C', 'KH'], p3: ['4S', '6C', 'QH'] },
      currentPlayer: 'p2',
    })
    expect(handOptions()).toHaveLength(0)
    expect(screen.getByText('次のラウンドから参加できます')).toBeInTheDocument()
  })

  it('a late joiner (ready, but not in the play order) watches without a hand', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({
      presence: makeSessionPresence([
        { id: 'p1', name: 'alice', role: 'player' },
        { id: 'p2', name: 'bob' },
        { id: 'p3', name: 'carol' },
      ]),
      hands: { p2: ['2S'], p3: ['4S'] },
      currentPlayer: 'p2',
    })
    expect(handOptions()).toHaveLength(0)
    expect(screen.getByText('次のラウンドから参加できます')).toBeInTheDocument()
  })

  it('shows the GAME SET dialog after game-ended', async () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying()
    emit(msgs.gameEnd(bob), bundle({ hands: { p1: ['AS'], p2: [] }, winner: 'p2' }), {
      event: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'empty-hand' },
      patch: { roomStatus: 'waitingNextRound' },
    })
    // the director holds the end for up to 800 ms (spec §9.3) before the dialog opens
    const cta = await screen.findByRole('button', { name: /次のラウンド/ }, { timeout: 2500 })
    expect(cta).toBeInTheDocument()
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GAME SET|Q\.E\.D|勝/).length).toBeGreaterThan(0)
  })

  it('a snapshot straight into GAME SET opens the dialog with the stored winner', async () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({ presence: makeSessionPresence(['alice', 'bob']), roomStatus: 'waitingNextRound' })
    emit({ action: 'snapshot' }, bundle({ hands: { p1: ['AS'], p2: [] }, winner: 'p2' }))
    expect(await screen.findByRole('button', { name: /次のラウンドを開始/ }, { timeout: 2500 }))
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0)
  })
})

describe('GameBoard (timer: server deadline, no client pass)', () => {
  it('clock values reach the turn clock', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    act(() => roomSession.clock.set(42))
    const timers = screen.getAllByRole('timer')
    expect(timers.some((t) => t.getAttribute('aria-valuenow') === '42')).toBe(true)
  })

  it('sends no pass when the clock hits 0 on my turn (the server passes, RQ-C7)', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1' })
    act(() => roomSession.clock.set(3))
    act(() => roomSession.clock.set(0))
    expect(roomSession.actions.pass).not.toHaveBeenCalled()
    expect(toastMessages()).not.toContain(TIMEOUT_MESSAGE)
  })

  it('announces 残り5秒 on my turn only', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    act(() => roomSession.clock.set(5))
    expect(document.querySelector('[data-live-region]')).not.toHaveTextContent('残り5秒')
    emit(msgs.pass(bob), bundle({ currentPlayer: 'p1' }), {
      event: { type: 'passed', by: 'p2', reason: 'manual', flowed: false },
    })
    act(() => roomSession.clock.set(6))
    act(() => roomSession.clock.set(5))
    expect(document.querySelector('[data-live-region]')).toHaveTextContent('残り5秒')
  })

  it('logs 時間切れです and toasts red when the server timed me out', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying({ currentPlayer: 'p1' })
    emit(msgs.pass(alice, 'timeout'), bundle({ currentPlayer: 'p2' }), {
      event: { type: 'passed', by: 'p1', reason: 'timeout', flowed: false },
    })
    expect(logs).toContain(TIMEOUT_MESSAGE)
    expect(notificationsShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: TIMEOUT_MESSAGE, color: 'red' }),
    )
    expect(roomSession.actions.pass).not.toHaveBeenCalled()
  })

  it('logs 時間切れです without a toast when someone else timed out', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying({ currentPlayer: 'p2' })
    emit(msgs.pass(bob, 'timeout'), bundle({ currentPlayer: 'p1' }), {
      event: { type: 'passed', by: 'p2', reason: 'timeout', flowed: false },
    })
    expect(logs).toContain(TIMEOUT_MESSAGE)
    expect(toastMessages()).not.toContain(TIMEOUT_MESSAGE)
  })

  it('a manual pass logs no timeout', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying({ currentPlayer: 'p2' })
    emit(msgs.pass(bob), bundle({ currentPlayer: 'p1' }), {
      event: { type: 'passed', by: 'p2', reason: 'manual', flowed: false },
    })
    expect(logs).not.toContain(TIMEOUT_MESSAGE)
  })
})

describe('GameBoard (redesign)', () => {
  describe('game end ordering (client R4.1: submitted, then game-ended)', () => {
    const finish = ({ withSubmit }: { withSubmit: boolean }) => {
      const finalState = bundle({
        hands: { p1: ['AS', '3H'], p2: [] },
        field: [['KH']],
        deckTopPlayer: 'p2',
        winner: 'p2',
        currentPlayer: 'p1',
      })
      if (withSubmit) {
        emit(msgs.submit(bob, ['KH']), finalState, {
          event: {
            type: 'submitted',
            by: 'p2',
            submit: ['KH'] as never,
            factor: [],
            result: null,
            cut57: false,
            flowed: false,
            penalty: 0,
          },
        })
      }
      emit(msgs.gameEnd(bob), finalState, {
        event: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'empty-hand' },
        patch: { roomStatus: 'waitingNextRound' },
      })
    }

    it('opens the GameSetDialog only after the winning submit has played', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish({ withSubmit: true })
      advance(300)
      expect(gameSetCta()).toBeNull()
      advance(1500)
      expect(gameSetCta()).toBeInTheDocument()
    })

    it('releases the dialog after 800 ms when no submit precedes (last standing)', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish({ withSubmit: false })
      advance(750)
      expect(gameSetCta()).toBeNull()
      advance(1500) // the 800 ms hold, then the modal transition
      expect(gameSetCta()).toBeInTheDocument()
    })

    it('the next round CTA calls startGame', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish({ withSubmit: true })
      advance(2000)
      const cta = gameSetCta()
      expect(cta).not.toBeNull()
      act(() => {
        fireEvent.click(cta as HTMLElement)
      })
      expect(roomSession.actions.startGame).toHaveBeenCalledOnce()
    })

    it('the GAME SET ready toggle calls unsetReady / setReady', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      finish({ withSubmit: false })
      advance(2000)
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '取消' }))
      })
      expect(roomSession.actions.unsetReady).toHaveBeenCalledOnce()
      set({
        presence: makeSessionPresence([{ name: 'alice', status: 'not-ready' }, 'bob']),
      })
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '準備OK' }))
      })
      expect(roomSession.actions.setReady).toHaveBeenCalledOnce()
    })

    it('an observer is offered 次のラウンドに参加', () => {
      vi.useFakeTimers()
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({
        selfRole: 'observer',
        presence: makeSessionPresence([
          { id: 'p1', name: 'alice', role: 'observer', status: 'not-ready' },
          { id: 'p2', name: 'bob' },
          { id: 'p3', name: 'carol' },
        ]),
        hands: { p2: ['2S'], p3: ['4S'] },
        currentPlayer: 'p2',
      })
      emit(msgs.gameEnd(bob), bundle({ hands: { p2: [], p3: ['4S'] }, winner: 'p2' }), {
        event: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'empty-hand' },
        patch: { roomStatus: 'waitingNextRound' },
      })
      advance(2000)
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '次のラウンドに参加' }))
      })
      expect(roomSession.actions.setReady).toHaveBeenCalledOnce()
    })
  })

  describe('keyboard shortcuts (§9.5)', () => {
    it('D draws and P passes on my turn', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      press('d')
      expect(roomSession.actions.draw).toHaveBeenCalledOnce()
      press('P')
      expect(roomSession.actions.pass).toHaveBeenCalledOnce()
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
      expect(roomSession.actions.draw).not.toHaveBeenCalled()
      expect(roomSession.actions.pass).not.toHaveBeenCalled()

      emit(msgs.pass(bob), bundle({ currentPlayer: 'p1' }))
      press('d', screen.getByRole('textbox', { name: 'chat' }))
      expect(roomSession.actions.draw).not.toHaveBeenCalled()
      press('d')
      expect(roomSession.actions.draw).toHaveBeenCalledOnce()
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
      expect(roomSession.actions.submit).toHaveBeenCalledOnce()
      expect(roomSession.actions.submit).toHaveBeenCalledWith({ submit: ['AS'], factor: [] })
    })

    it('a blocked submit keeps the original message and shakes the tray', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      emit(
        msgs.pass(bob),
        bundle({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S'] }, field: [['KS', 'KH']] }),
      )
      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      expect(roomSession.actions.submit).not.toHaveBeenCalled()
      expect(notificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '場のカードの数より大きくないといけません',
          color: 'red',
        }),
      )
    })
  })

  describe('server rejections (ack ok:false) use the tray-error path (RQ-C6)', () => {
    it('shows the reason in the tray and a silent red toast', async () => {
      roomSession.setAck('submit', { ok: false, reason: 'invalid-move' })
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      const message = SUBMIT_REJECT_MESSAGES['invalid-move'] as string
      await waitFor(() =>
        expect(notificationsShow).toHaveBeenCalledWith({
          message,
          color: 'red',
          role: 'none',
        }),
      )
      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('an accepted submit shows no error', async () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      await act(async () => undefined)
      expect(roomSession.actions.submit).toHaveBeenCalledOnce()
      expect(notificationsShow.mock.calls.filter(([a]) => a.color === 'red')).toHaveLength(0)
    })

    it.each([
      ['not-your-turn', 'あなたの番ではありません'],
      ['stale', 'その手番はもう終わっています'],
      ['invalid-move', '出せないカードです'],
      ['invalid-fact', '素因数分解として成立していません'],
      ['deck-empty', '山札がありません'],
      ['already-drawn', 'すでにドローしています'],
      ['bad-status', 'ゲームは進行中ではありません'],
    ] as const)('maps %s to Japanese', (reason, text) => {
      expect(submitRejectMessage({ ok: false, reason })).toBe(text)
    })

    it.each(['timeout', 'disconnected', 'rate-limited'] as const)(
      'falls back to a retry message for %s',
      (reason) => {
        expect(submitRejectMessage({ ok: false, reason })).toBe(SUBMIT_REJECT_FALLBACK)
      },
    )
  })

  it('a server event that clears a non-empty tray shows the helper toast at most once per 5 s', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    const otherEvent = () => emit(msgs.draw(bob), bundle({ currentPlayer: 'p2' }))
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(toastMessages().filter((m) => m === TRAY_WIPE_MESSAGE)).toHaveLength(1)
    // the tray was wiped: the card is back in the hand
    expect(handOptions()).toHaveLength(3)
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(toastMessages().filter((m) => m === TRAY_WIPE_MESSAGE)).toHaveLength(1)
  })

  it('the helper toast comes back once the 5 s throttle has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    const otherEvent = () => emit(msgs.draw(bob), bundle({ currentPlayer: 'p2' }))
    const wipes = () => toastMessages().filter((m) => m === TRAY_WIPE_MESSAGE).length
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(wipes()).toBe(1)
    vi.setSystemTime(new Date('2026-01-01T00:00:04.900Z'))
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(wipes()).toBe(1)
    vi.setSystemTime(new Date('2026-01-01T00:00:05.100Z'))
    fireEvent.click(handOptions()[0])
    otherEvent()
    expect(wipes()).toBe(2)
  })

  it('the winner gets no tray-wipe toast for their winning submit and game-ended', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1', hands: { p1: ['KH'], p2: ['2S', '5C'] } })
    fireEvent.click(handOptions()[0]) // the winning card sits in my tray
    const finalState = bundle({
      hands: { p1: [], p2: ['2S', '5C'] },
      field: [['KH']],
      deckTopPlayer: 'p1',
      winner: 'p1',
      currentPlayer: 'p2',
    })
    emit(msgs.submit(alice, ['KH']), finalState)
    emit(msgs.gameEnd(alice), finalState, {
      event: { type: 'game-ended', winnerId: 'p1', winnerName: 'alice', reason: 'empty-hand' },
      patch: { roomStatus: 'waitingNextRound' },
    })
    expect(toastMessages()).not.toContain(TRAY_WIPE_MESSAGE)
  })

  describe('GAME SET (waitingNextRound)', () => {
    it('D / P / Enter send nothing while the round is over, even on "my turn"', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p2' })
      // after the winning submit the server has already moved currentPlayer to me
      const finalState = bundle({
        hands: { p1: ['AS', '3H'], p2: [] },
        field: [['KH']],
        winner: 'p2',
        currentPlayer: 'p1',
      })
      emit(msgs.submit(bob, ['KH']), finalState)
      emit(msgs.gameEnd(bob), finalState, {
        event: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'empty-hand' },
        patch: { roomStatus: 'waitingNextRound' },
      })
      press('d')
      press('p')
      fireEvent.click(handOptions()[0])
      press('Enter', document.body)
      expect(roomSession.actions.draw).not.toHaveBeenCalled()
      expect(roomSession.actions.pass).not.toHaveBeenCalled()
      expect(roomSession.actions.submit).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /パス|pass/i })).toBeDisabled()
    })
  })

  describe('factor-mode shortcuts', () => {
    const enterFactorMode = () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1', hands: { p1: ['QS', '2H', '3C', '7D'], p2: ['5C'] } })
      fireEvent.click(handOptions()[0]) // 12 into the tray
      press('f')
      const panel = () => screen.getByRole('listbox', { name: /因数/ })
      return { panel }
    }

    it('x / * add ×, ^ adds a power, Backspace removes the last factor token', () => {
      const { panel } = enterFactorMode()
      fireEvent.click(handOptions()[0]) // 2
      press('x')
      fireEvent.click(handOptions()[0]) // 3
      press('*')
      press('^')
      const tokens = () => within(panel()).queryAllByRole('option').length
      expect(tokens()).toBe(5)
      press('Backspace')
      expect(tokens()).toBe(4)
      // the hand cards used as factors are not back in the hand: only 7 remains there
      expect(handOptions()).toHaveLength(1)
    })

    it('x and ^ do nothing outside factor mode', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying({ currentPlayer: 'p1' })
      fireEvent.click(handOptions()[0])
      press('x')
      press('^')
      expect(screen.queryByRole('listbox', { name: /因数/ })).toBeNull()
    })
  })

  it('a count mismatch is blocked locally with its own message', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1', hands: { p1: ['AS', '3H', 'JD'], p2: ['2S'] } })
    emit(msgs.pass(bob), bundle({ hands: { p1: ['AS', '3H', 'JD'], p2: ['2S'] }, field: [['2C']] }))
    fireEvent.click(handOptions()[0]) // A
    fireEvent.click(handOptions()[0]) // 3 → 13 > 2, but two cards on one
    press('Enter', document.body)
    expect(roomSession.actions.submit).not.toHaveBeenCalled()
    expect(notificationsShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: '出すカードの枚数が合っていません', role: 'none' }),
    )
  })

  it('引く explains ドロー済み after I have drawn', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1' })
    emit(
      msgs.draw(alice),
      bundle({ hands: { p1: ['AS', '3H', 'JD', '4C'], p2: ['2S'] }, drawRight: false }),
    )
    const draw = screen.getByRole('button', { name: /引く/ })
    expect(draw).toBeDisabled()
    expect(draw).toHaveAccessibleDescription('ドロー済み')
  })

  it('board events go to the proof log; only failed submits also toast (§9.2 #29)', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying({ currentPlayer: 'p2' })
    const before = logs.length
    emit(msgs.draw(bob), bundle({ currentPlayer: 'p2' }))
    emit(msgs.pass(bob), bundle({ currentPlayer: 'p1' }))
    emit(msgs.submit(bob, ['5C']), bundle({ currentPlayer: 'p1', field: [['5C']] }))
    expect(logs.length - before).toBe(3)
    expect(
      notificationsShow.mock.calls.filter(([a]) => (a as { color?: string }).color !== 'red'),
    ).toHaveLength(0)
    emit(msgs.submit(bob, ['KH'], 'BASE_IS_NOT_PRIME'), bundle({ currentPlayer: 'p1' }))
    expect(notificationsShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }))
  })

  it('logs ゲームを開始します on game start', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying()
    expect(logs.map(textOf)).toContain(GAME_START_MESSAGE)
  })

  it('logs the winner name from the game-ended event', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    startPlaying({ currentPlayer: 'p2' })
    emit(
      { action: 'game-end', winner: 'stale-name', winnerId: 'p2' },
      bundle({ hands: { p1: ['AS'], p2: [] }, winner: 'p2' }),
      {
        event: { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'last-standing' },
        patch: { roomStatus: 'waitingNextRound' },
      },
    )
    expect(textOf(logs.at(-1))).toContain('bob の勝利です')
  })

  it('an empty tray wipe is silent', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p2' })
    emit(msgs.draw(bob), bundle({ currentPlayer: 'p2' }))
    expect(toastMessages()).not.toContain(TRAY_WIPE_MESSAGE)
  })

  it('logs rule changes as axiom diffs, not JSON', () => {
    const logs: ReactNode[] = []
    renderWithProviders(<GameBoard id="room-1" onLogNotification={(m) => logs.push(m)} />)
    set({ presence: makeSessionPresence(['alice', 'bob']), roomStatus: 'waiting' })
    const rule = { ...roomSession.current.rule, timeLimit: 15 }
    emit({ action: 'change-rule', rule, by: 'p2' }, bundle(), { patch: { game: null, rule } })
    const text = textOf(logs.at(-1))
    expect(text).toContain('t: 60 → 15 s')
    expect(text).not.toContain('{')
  })

  it('a snapshot sets the state without animation or announcements (RQ-C3)', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    set({ presence: makeSessionPresence(['alice', 'bob']), roomStatus: 'playing' })
    emit(
      { action: 'snapshot' },
      bundle({ currentPlayer: 'p1', hands: { p1: ['2S', '4D'], p2: ['3C'] } }),
    )
    expect(handOptions()).toHaveLength(2)
    expect(document.querySelector('[data-live-region]')).not.toHaveTextContent('あなたの番です')
  })

  it('announces my turn in the live region', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({ currentPlayer: 'p1' })
    expect(document.querySelector('[data-live-region]')).toHaveTextContent('あなたの番です')
  })

  it('marks a disconnected player seat as 再接続中', () => {
    renderWithProviders(<GameBoard id="room-1" />)
    startPlaying({
      presence: makeSessionPresence([
        { id: 'p1', name: 'alice' },
        { id: 'p2', name: 'bob', connected: false },
      ]),
    })
    expect(screen.getAllByLabelText(/bob.*（再接続中）/).length).toBeGreaterThan(0)
    expect(screen.queryAllByLabelText(/alice.*（再接続中）/)).toHaveLength(0)
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

  it('hands the session leave to the room chrome (header 退出)', async () => {
    const setLeave = vi.fn()
    const { unmount } = renderWithProviders(
      <RoomChromeContext.Provider value={{ setLeave }}>
        <GameBoard id="room-1" />
      </RoomChromeContext.Provider>,
    )
    const leave = setLeave.mock.calls.at(-1)?.[0] as () => Promise<void>
    expect(typeof leave).toBe('function')
    await leave()
    expect(roomSession.actions.leave).toHaveBeenCalledOnce()
    unmount()
    expect(setLeave).toHaveBeenLastCalledWith(null)
  })

  describe('connection states', () => {
    it('shows the connecting ring while the session connects', () => {
      roomSession.reset({ connection: 'connecting' })
      renderWithProviders(<GameBoard id="room-1" />)
      expect(screen.getByText('接続中…')).toBeInTheDocument()
    })

    it('shows the waiting-for-sync state', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      set({
        presence: makeSessionPresence(['alice', 'bob']),
        roomStatus: 'playing',
        connection: 'waiting-sync',
      })
      expect(screen.getByText('次のイベントを待っています…')).toBeInTheDocument()
    })

    it('offers 再接続 when the session is closed', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      set({ connection: 'closed' })
      expect(screen.getByRole('alert')).toHaveTextContent('接続が切れました')
      fireEvent.click(screen.getByRole('button', { name: '再接続' }))
      expect(roomSession.actions.reconnect).toHaveBeenCalledOnce()
    })

    it('a superseded tab offers このタブで再開', () => {
      renderWithProviders(<GameBoard id="room-1" />)
      startPlaying()
      set({ connection: 'closed', closeReason: 'superseded' })
      expect(screen.getByRole('alert')).toHaveTextContent('別のタブで開かれています')
      // the board stays mounted with the last state (RQ-C5)
      expect(handOptions()).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'このタブで再開' }))
      expect(roomSession.actions.reconnect).toHaveBeenCalledOnce()
    })
  })
})
