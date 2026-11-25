/**
 * Socket abstraction for the pure hosts (spec §2.1, §3.4, §4.2) plus the thin adapter over the
 * Durable Object WebSocket Hibernation API. Nothing here imports `cloudflare:*`; the adapter
 * only uses ambient Workers types, so the pure hosts stay testable in Node.
 */
import type { Pid } from '../../src/shared/ids'

/** What a room socket carries across hibernation (`serializeAttachment`, spec §4.2). */
export type SocketAttachment = {
  /** null until the socket's `hello` has been accepted */
  pid: Pid | null
  connNo: number
  name: string
  acceptedAt: number
  /** last client frame seen by the host (fallback when there is no auto-response timestamp) */
  lastMessageAt: number
}

export interface HostSocket {
  readonly attachment: SocketAttachment
  setAttachment(attachment: SocketAttachment): void
  send(text: string): void
  close(code: number, reason?: string): void
  /** epoch ms of the runtime's last automatic `pong`, or null if it never answered a ping */
  autoResponseAt(): number | null
}

export interface HostSocketRegistry {
  /** Every attached, open socket. */
  all(): HostSocket[]
}

/** Latest sign of life from a socket (spec §3.4 sweep). */
export function lastActivityAt(socket: HostSocket): number {
  const a = socket.attachment
  return Math.max(a.acceptedAt, a.lastMessageAt, socket.autoResponseAt() ?? 0)
}

export function freshAttachment(now: number): SocketAttachment {
  return { pid: null, connNo: 0, name: '', acceptedAt: now, lastMessageAt: now }
}

const WS_OPEN = 1

/** Adapter over `ctx.getWebSockets()`; wrappers are cached so per-socket host state is stable. */
export class DurableObjectSockets implements HostSocketRegistry {
  private readonly wrappers = new WeakMap<WebSocket, HostSocket>()

  constructor(private readonly ctx: DurableObjectState) {}

  wrap(ws: WebSocket): HostSocket {
    const cached = this.wrappers.get(ws)
    if (cached) {
      return cached
    }
    const ctx = this.ctx
    let attachment = (ws.deserializeAttachment() as SocketAttachment | null) ?? freshAttachment(0)
    const socket: HostSocket = {
      get attachment() {
        return attachment
      },
      setAttachment(next) {
        attachment = next
        ws.serializeAttachment(next)
      },
      send(text) {
        try {
          ws.send(text)
        } catch {
          // already closed: the close handler reports the disconnect
        }
      },
      close(code, reason) {
        try {
          ws.close(code, reason)
        } catch {
          // already closed
        }
      },
      autoResponseAt() {
        return ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null
      },
    }
    this.wrappers.set(ws, socket)
    return socket
  }

  all(): HostSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WS_OPEN)
      .map((ws) => this.wrap(ws))
  }
}
