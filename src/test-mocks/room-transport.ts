/**
 * A controllable fake `RoomTransport` (spec §9.1) for the session hook tests.
 *
 * Usage:
 *   import { roomTransportControl } from '@/test-mocks/room-transport'
 *   renderHook(() => useRoomSession('1009', { transportFactory: roomTransportControl.factory }))
 *   act(() => roomTransportControl.last().__open())
 *   act(() => roomTransportControl.last().__emit(frames.welcome()))
 *   expect(roomTransportControl.last().lastCmd()).toMatchObject({ c: { type: 'ready' } })
 *
 * Like the real transport, a terminal close code (4000-4006) or a received `bye` frame makes the
 * next `__close` non-reconnecting.
 */
import { READY_STATE, type RoomTransport, isByeFrame } from '@/app/room/[id]/session/transport'
import { type CmdFrame, TERMINAL_CLOSE_CODES } from '@/shared/protocol'

export class FakeRoomTransport implements RoomTransport {
  onOpen: (() => void) | null = null
  onMessage: ((text: string) => void) | null = null
  onClose: ((code: number, reconnecting: boolean) => void) | null = null
  onError: (() => void) | null = null

  readyState: number = READY_STATE.CLOSED
  /** every url passed to `connect`, in order */
  readonly urls: string[] = []
  /** every text frame accepted by `send` */
  readonly frames: string[] = []
  /** codes passed to `close()` (`undefined` when called without one) */
  readonly closeCalls: (number | undefined)[] = []
  /** how many times `reconnectNow()` was called */
  reconnectNowCalls = 0
  private byeSeen = false

  get url(): string | undefined {
    return this.urls.at(-1)
  }

  get closed(): boolean {
    return this.closeCalls.length > 0 && this.readyState === READY_STATE.CLOSED
  }

  connect(url: string): void {
    this.urls.push(url)
    this.byeSeen = false
    this.readyState = READY_STATE.CONNECTING
  }

  send(text: string): boolean {
    if (this.readyState !== READY_STATE.OPEN) {
      return false
    }
    this.frames.push(text)
    return true
  }

  /** Like the real transport: the dropped socket reports a reconnecting abnormal close. */
  reconnectNow(): void {
    this.reconnectNowCalls += 1
    if (this.readyState === READY_STATE.CLOSED && this.closeCalls.length > 0) {
      return
    }
    const wasOpen = this.readyState === READY_STATE.OPEN
    this.readyState = READY_STATE.CONNECTING
    if (wasOpen) {
      this.onClose?.(1006, true)
    }
  }

  close(code?: number): void {
    this.closeCalls.push(code)
    this.readyState = READY_STATE.CLOSED
  }

  /** The socket opened. */
  __open(): void {
    this.readyState = READY_STATE.OPEN
    this.onOpen?.()
  }

  /** Deliver a server frame (objects are JSON-stringified). */
  __emit(frame: unknown): void {
    const text = typeof frame === 'string' ? frame : JSON.stringify(frame)
    if (isByeFrame(text)) {
      this.byeSeen = true
    }
    this.onMessage?.(text)
  }

  /** The socket closed with `code`; reconnects unless the code is terminal or a bye was seen. */
  __close(code = 1006): void {
    const reconnecting = !(this.byeSeen || TERMINAL_CLOSE_CODES.includes(code))
    this.readyState = reconnecting ? READY_STATE.CONNECTING : READY_STATE.CLOSED
    this.onClose?.(code, reconnecting)
  }

  /** The socket reported an error. */
  __error(): void {
    this.onError?.()
  }

  /** Every sent JSON frame, parsed (the bare `ping` text is skipped). */
  sent(): unknown[] {
    const out: unknown[] = []
    for (const text of this.frames) {
      try {
        out.push(JSON.parse(text))
      } catch {
        // not JSON (ping)
      }
    }
    return out
  }

  /** The last `cmd` frame sent, if any. */
  lastCmd(): CmdFrame | undefined {
    return this.sent()
      .filter((f): f is CmdFrame => (f as { t?: unknown }).t === 'cmd')
      .at(-1)
  }
}

export const roomTransportControl = {
  transports: [] as FakeRoomTransport[],
  /** Pass as `transportFactory`: creates and records a new fake. */
  factory: (): RoomTransport => {
    const transport = new FakeRoomTransport()
    roomTransportControl.transports.push(transport)
    return transport
  },
  last(): FakeRoomTransport {
    const transport = roomTransportControl.transports.at(-1)
    if (!transport) {
      throw new Error('no fake RoomTransport has been created yet')
    }
    return transport
  },
  reset(): void {
    roomTransportControl.transports = []
  },
}
