/**
 * The room socket seen by the session hook (spec §9.1). The production implementation is the
 * reconnecting WebSocket in `ws-transport.ts`; tests use `src/test-mocks/room-transport.ts`.
 *
 * A transport is reconnecting: after `connect(url)` it keeps a socket open until a terminal close
 * (close codes 4000-4006, or a `bye` frame) or until `close()` is called. Every underlying socket
 * reports `onOpen` and later `onClose`, so the hook sees each reconnect.
 */

/** WebSocket ready states (same numbers as `WebSocket.CONNECTING` … `WebSocket.CLOSED`). */
export const READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const

export type ReadyState = (typeof READY_STATE)[keyof typeof READY_STATE]

export interface RoomTransport {
  /** Start (or restart, also after a terminal close) connecting to `url`. */
  connect(url: string): void
  /** Send a text frame. Returns false (and drops the frame) when the socket is not open. */
  send(text: string): boolean
  /** Stop for good: close the socket, cancel reconnects and fire no further callbacks. */
  close(code?: number): void
  /** A socket opened. */
  onOpen: (() => void) | null
  /** A text frame arrived (the liveness `pong` is swallowed by the transport). */
  onMessage: ((text: string) => void) | null
  /** A socket closed; `reconnecting` is false after a terminal close code or a `bye` frame. */
  onClose: ((code: number, reconnecting: boolean) => void) | null
  /** A socket reported an error (a close always follows). */
  onError: (() => void) | null
  readonly readyState: number
}

/** Creates a fresh, unconnected transport. The hook takes one through `transportFactory`. */
export type RoomTransportFactory = () => RoomTransport

/** True when a server text frame is a `bye` (cheap check, no schema validation). */
export function isByeFrame(text: string): boolean {
  if (!text.includes('"bye"')) {
    return false
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && (parsed as { t?: unknown }).t === 'bye'
  } catch {
    return false
  }
}
