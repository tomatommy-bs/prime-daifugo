'use client'

/**
 * Home-page lobby counters (spec §8.2, RQ-L1): a WebSocket to `{RT}/lobby` that receives
 * `{t:'lobby', lobby, room}` frames. Returns `null` until the first frame, so the UI shows "—".
 *
 * Connection failures are silent (no console output) and retried with a capped backoff, so a
 * `next dev` without the Worker just keeps the counters at "—".
 */
import { wsUrl } from '@/constants/env'
import { type LobbyStats, parseServerFrame } from '@/shared/protocol'
import { useEffect, useState } from 'react'

export type LobbyCounts = {
  /** Everyone connected: home-page sockets plus connected room members. */
  online: number
  /** Sockets on the home page. */
  lobby: number
  /** Rooms with at least one connected member. */
  rooms: number
}

/** The subset of the WebSocket constructor the hook needs (injectable for tests). */
export type WebSocketCtor = new (url: string) => WebSocket

export type UseLobbyStatsOptions = {
  /** Lobby socket URL; defaults to `wsUrl('/lobby')`. `null` means no backend: stay at `null`. */
  url?: string | null
  WebSocketImpl?: WebSocketCtor
}

export const LOBBY_BACKOFF_MIN_MS = 1_000
export const LOBBY_BACKOFF_MAX_MS = 10_000

/** Delay before reconnect attempt `attempt` (0-based): 1 s, 2 s, 4 s, 8 s, then 10 s. */
export function lobbyBackoffMs(attempt: number): number {
  return Math.min(LOBBY_BACKOFF_MAX_MS, LOBBY_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt))
}

/** `online = sum(room) + lobby`, `rooms = keys(room).length` (spec §8.2). */
export function toLobbyCounts(stats: Pick<LobbyStats, 'lobby' | 'room'>): LobbyCounts {
  const counts = Object.values(stats.room)
  return {
    online: counts.reduce((sum, n) => sum + n, 0) + stats.lobby,
    lobby: stats.lobby,
    rooms: counts.length,
  }
}

function defaultCtor(): WebSocketCtor | undefined {
  return typeof WebSocket === 'undefined' ? undefined : WebSocket
}

export function useLobbyStats(options: UseLobbyStatsOptions = {}): LobbyCounts | null {
  const url = options.url === undefined ? wsUrl('/lobby') : options.url
  const Ctor = options.WebSocketImpl ?? defaultCtor()
  const [counts, setCounts] = useState<LobbyCounts | null>(null)

  useEffect(() => {
    if (url === null || Ctor === undefined) {
      return
    }
    let disposed = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const scheduleReconnect = () => {
      if (disposed || retry !== null) {
        return
      }
      retry = setTimeout(() => {
        retry = null
        connect()
      }, lobbyBackoffMs(attempt))
      attempt += 1
    }

    const connect = () => {
      if (disposed) {
        return
      }
      let ws: WebSocket
      try {
        ws = new Ctor(url)
      } catch {
        scheduleReconnect()
        return
      }
      socket = ws
      ws.onopen = () => {
        attempt = 0
      }
      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          return
        }
        const parsed = parseServerFrame(event.data)
        if (parsed.ok && parsed.frame.t === 'lobby') {
          setCounts(toLobbyCounts(parsed.frame))
        }
      }
      // Errors are always followed by close; both stay silent.
      ws.onerror = () => undefined
      ws.onclose = () => {
        if (socket === ws) {
          socket = null
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      disposed = true
      if (retry !== null) {
        clearTimeout(retry)
        retry = null
      }
      const ws = socket
      socket = null
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // already closed
        }
      }
    }
  }, [url, Ctor])

  return counts
}
