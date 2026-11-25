/**
 * A controllable fake for `partysocket/react`.
 *
 * Usage in a test file:
 *   vi.mock('partysocket/react', () => import('@/test-mocks/partysocket'))
 *   import { partySocketControl } from '@/test-mocks/partysocket'
 *   ...render
 *   act(() => partySocketControl.last().__emit(serverMsg.presence([...])))
 *   expect(partySocketControl.last().send).toHaveBeenCalledWith(JSON.stringify({ ... }))
 */
import { useEffect, useReducer, useRef } from 'react'
import { vi } from 'vitest'

type Handlers = {
  onMessage?: (event: MessageEvent) => void
  onOpen?: (event: Event) => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
  [key: string]: unknown
}

export const READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const

export class FakePartySocket {
  readonly CONNECTING = READY_STATE.CONNECTING
  readonly OPEN = READY_STATE.OPEN
  readonly CLOSING = READY_STATE.CLOSING
  readonly CLOSED = READY_STATE.CLOSED

  id: string
  readyState: number
  readonly options: Handlers
  readonly send = vi.fn<(data: string) => void>()
  readonly reconnect = vi.fn(() => undefined)
  readonly close = vi.fn(() => undefined)

  /** Latest handler set (the real hook re-binds handlers on every render). */
  handlers: Handlers
  rerender: () => void = () => undefined

  constructor(options: Handlers, id: string, readyState: number) {
    this.options = options
    this.handlers = options
    this.id = id
    this.readyState = readyState
  }

  /** Deliver a server message. Objects are JSON-stringified. */
  __emit(payload: unknown) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.handlers.onMessage?.({ data } as MessageEvent)
  }

  /** Change the connection state and re-render the owning component. */
  __setReadyState(state: number) {
    this.readyState = state
    this.rerender()
  }

  /** Every payload passed to `send`, parsed back from JSON. */
  get sentPayloads(): unknown[] {
    return this.send.mock.calls.map(([data]) => JSON.parse(data))
  }
}

export const partySocketControl = {
  /** id given to the next socket created */
  nextId: 'p1',
  /** readyState given to the next socket created */
  nextReadyState: READY_STATE.OPEN as number,
  /** call `onOpen` right after mount */
  autoOpen: true,
  sockets: [] as FakePartySocket[],
  last(): FakePartySocket {
    const socket = this.sockets.at(-1)
    if (!socket) {
      throw new Error('no fake PartySocket has been created yet')
    }
    return socket
  },
  reset() {
    this.nextId = 'p1'
    this.nextReadyState = READY_STATE.OPEN
    this.autoOpen = true
    this.sockets = []
  },
}

export default function usePartySocket(options: Handlers): FakePartySocket {
  const ref = useRef<FakePartySocket | null>(null)
  const [, force] = useReducer((n: number) => n + 1, 0)
  if (ref.current === null) {
    ref.current = new FakePartySocket(
      options,
      partySocketControl.nextId,
      partySocketControl.nextReadyState,
    )
    partySocketControl.sockets.push(ref.current)
  }
  const socket = ref.current
  socket.handlers = options
  socket.rerender = force

  useEffect(() => {
    if (partySocketControl.autoOpen && socket.readyState === READY_STATE.OPEN) {
      socket.handlers.onOpen?.(new Event('open'))
    }
  }, [socket])

  return socket
}

export { usePartySocket }
