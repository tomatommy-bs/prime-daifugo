/**
 * Router logic (spec §8.1), written against injected handlers so it runs in Node tests.
 * `index.ts` wires the handlers to the Durable Object bindings.
 */
import { ROOM_ID_RE } from '../../src/shared/ids'

export type Route =
  | { kind: 'healthz' }
  | { kind: 'lobby-ws' }
  | { kind: 'create-room' }
  | { kind: 'room-info'; id: string }
  | { kind: 'room-ws'; id: string }

export type RouteMatch =
  | { ok: true; route: Route }
  | { ok: false; status: 404 | 405; allow?: string }

const ROOM_PATH_RE = /^\/rooms\/([^/]+)(\/ws)?$/

/** Match a method and path against the route table. */
export function matchRoute(method: string, pathname: string): RouteMatch {
  const m = method.toUpperCase()
  const only = (allow: string, route: Route): RouteMatch =>
    m === allow || (allow === 'GET' && m === 'HEAD' && route.kind === 'healthz')
      ? { ok: true, route }
      : { ok: false, status: 405, allow }

  if (pathname === '/healthz') {
    return only('GET', { kind: 'healthz' })
  }
  if (pathname === '/lobby') {
    return only('GET', { kind: 'lobby-ws' })
  }
  if (pathname === '/rooms') {
    return only('POST', { kind: 'create-room' })
  }
  const room = ROOM_PATH_RE.exec(pathname)
  if (room) {
    let id: string
    try {
      id = decodeURIComponent(room[1])
    } catch {
      return { ok: false, status: 404 }
    }
    if (!ROOM_ID_RE.test(id)) {
      return { ok: false, status: 404 }
    }
    return room[2] ? only('GET', { kind: 'room-ws', id }) : only('GET', { kind: 'room-info', id })
  }
  return { ok: false, status: 404 }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `origin` is in `allowed`. An entry may contain `*`, which matches one or more
 * characters of `[A-Za-z0-9-]` (never a dot, so it stays inside one host label).
 */
export function isOriginAllowed(origin: string | null, allowed: readonly string[]): boolean {
  if (!origin) {
    return false
  }
  return allowed.some((entry) => {
    if (!entry.includes('*')) {
      return entry === origin
    }
    const pattern = entry.split('*').map(escapeRegExp).join('[A-Za-z0-9-]+')
    return new RegExp(`^${pattern}$`).test(origin)
  })
}

/** CORS response headers for an allowed origin (empty when the origin is not allowed). */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Headers {
  const headers = new Headers()
  if (origin && isOriginAllowed(origin, allowed)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
    headers.set('access-control-allow-headers', 'content-type')
    headers.set('access-control-max-age', '600')
  }
  headers.set('vary', 'Origin')
  return headers
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

export type RoomInfo = {
  exists: boolean
  status: string | null
  members: number
  connected: number
  capacity: number
}

export type RouterDeps = {
  allowedOrigins: readonly string[]
  /** `LobbyDO.allocate()` */
  createRoom(): Promise<string>
  /** `RoomDO.info()` */
  roomInfo(id: string): Promise<RoomInfo>
  /** forward the upgrade request to the room's Durable Object */
  roomSocket(id: string, request: Request): Promise<Response>
  /** forward the upgrade request to the lobby Durable Object */
  lobbySocket(request: Request): Promise<Response>
}

function text(status: number, body: string, headers = new Headers()): Response {
  headers.set('content-type', 'text/plain; charset=utf-8')
  return new Response(body, { status, headers })
}

function json(status: number, body: unknown, headers = new Headers()): Response {
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

/** Handle one request per the §8.1 route table. */
export async function handleRequest(request: Request, deps: RouterDeps): Promise<Response> {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const allowed = isOriginAllowed(origin, deps.allowedOrigins)

  if (request.method.toUpperCase() === 'OPTIONS') {
    if (!allowed) {
      return text(403, 'forbidden origin', corsHeaders(null, []))
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, deps.allowedOrigins) })
  }

  const match = matchRoute(request.method, url.pathname)
  if (!match.ok) {
    const headers = corsHeaders(origin, deps.allowedOrigins)
    if (match.allow) {
      headers.set('allow', match.allow)
    }
    return text(match.status, match.status === 404 ? 'not found' : 'method not allowed', headers)
  }
  const { route } = match

  if (route.kind === 'healthz') {
    return text(200, 'ok')
  }

  if (route.kind === 'lobby-ws' || route.kind === 'room-ws') {
    // Upgrades must carry an allowed Origin (spec §3.1, §8.1); no Origin is rejected too.
    if (!allowed) {
      return text(403, 'forbidden origin')
    }
    if (!isWebSocketUpgrade(request)) {
      return text(426, 'expected websocket', new Headers({ upgrade: 'websocket' }))
    }
    return route.kind === 'lobby-ws'
      ? deps.lobbySocket(request)
      : deps.roomSocket(route.id, request)
  }

  // Plain HTTP: no Origin (server-to-server from Vercel) is allowed; a foreign Origin is not.
  if (origin && !allowed) {
    return text(403, 'forbidden origin', corsHeaders(null, []))
  }
  const cors = corsHeaders(origin, deps.allowedOrigins)
  try {
    if (route.kind === 'create-room') {
      const roomId = await deps.createRoom()
      return json(200, { roomId }, cors)
    }
    const info = await deps.roomInfo(route.id)
    return json(200, info, cors)
  } catch {
    return text(500, 'internal error', cors)
  }
}
