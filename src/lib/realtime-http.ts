/**
 * Plain-HTTP calls to the realtime Worker (spec §8.1, §8.3). Used from server components and the
 * browser alike; failures throw so the route's `error.tsx` boundary shows.
 */
import { httpUrl } from '@/constants/env'
import { isValidRoomId } from '@/shared/ids'

export const REALTIME_HTTP_TIMEOUT_MS = 10_000

export class RealtimeHttpError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RealtimeHttpError'
    this.status = status
  }
}

/** `GET /rooms/:id` (spec §8.1). */
export type RoomInfo = {
  exists: boolean
  status: string
  members: number
  connected: number
  capacity: number
}

export type RealtimeHttpOptions = {
  /** Backend base URL; defaults to `NEXT_PUBLIC_REALTIME_URL` (see `@/constants/env`). */
  base?: string | null
  fetch?: typeof fetch
  timeoutMs?: number
}

function resolve(path: string, options: RealtimeHttpOptions): string {
  const url = options.base === undefined ? httpUrl(path) : httpUrl(path, options.base)
  if (url === null) {
    throw new RealtimeHttpError('NEXT_PUBLIC_REALTIME_URL is not configured')
  }
  return url
}

async function requestJson(
  path: string,
  init: RequestInit,
  options: RealtimeHttpOptions,
): Promise<unknown> {
  const url = resolve(path, options)
  const doFetch = options.fetch ?? fetch
  let res: Response
  try {
    res = await doFetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? REALTIME_HTTP_TIMEOUT_MS),
    })
  } catch (cause) {
    // DOMException is not an Error subclass in every runtime, so match on the name only.
    const timedOut = (cause as { name?: unknown } | null)?.name === 'TimeoutError'
    throw new RealtimeHttpError(
      timedOut
        ? `${init.method ?? 'GET'} ${path} timed out`
        : `${init.method ?? 'GET'} ${path} failed`,
      undefined,
      { cause },
    )
  }
  if (!res.ok) {
    throw new RealtimeHttpError(
      `${init.method ?? 'GET'} ${path} returned ${res.status}`,
      res.status,
    )
  }
  try {
    return await res.json()
  } catch (cause) {
    throw new RealtimeHttpError(
      `${init.method ?? 'GET'} ${path} returned invalid JSON`,
      res.status,
      {
        cause,
      },
    )
  }
}

/** `POST /rooms`: reserve a fresh prime room id (RQ-L3). */
export async function createRoom(options: RealtimeHttpOptions = {}): Promise<{ roomId: string }> {
  const body = await requestJson('/rooms', { method: 'POST' }, options)
  const roomId = (body as { roomId?: unknown } | null)?.roomId
  if (!isValidRoomId(roomId)) {
    throw new RealtimeHttpError('POST /rooms returned an invalid room id')
  }
  return { roomId }
}

function isRoomInfo(value: unknown): value is RoomInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    typeof v.exists === 'boolean' &&
    typeof v.status === 'string' &&
    typeof v.members === 'number' &&
    typeof v.connected === 'number' &&
    typeof v.capacity === 'number'
  )
}

/** `GET /rooms/:id`: occupancy of a room, without joining it. */
export async function getRoomInfo(
  id: string,
  options: RealtimeHttpOptions = {},
): Promise<RoomInfo> {
  if (!isValidRoomId(id)) {
    throw new RealtimeHttpError(`invalid room id: ${JSON.stringify(id)}`)
  }
  const body = await requestJson(`/rooms/${encodeURIComponent(id)}`, { method: 'GET' }, options)
  if (!isRoomInfo(body)) {
    throw new RealtimeHttpError(`GET /rooms/${id} returned an unexpected body`)
  }
  return body
}
