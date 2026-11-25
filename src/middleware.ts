import {
  SITE_URL,
  X_ROBOTS_NOINDEX,
  isProductionDeployment,
  isProductionHost,
  isVercelProduction,
} from '@/lib/site'
import { SID_COOKIE, SID_COOKIE_DAYS, generateSid, isValidSid } from '@/shared/ids'
import { isValidName } from '@/shared/name'
import { NextResponse } from 'next/server'
import type { MiddlewareConfig, NextRequest } from 'next/server'

const SID_MAX_AGE_SECONDS = SID_COOKIE_DAYS * 24 * 60 * 60

/**
 * Issue the session secret (spec §3.1) when the request carries no valid `pd_sid`. The cookie is
 * deliberately not httpOnly: the client reads it and sends it to the realtime Worker in `hello`.
 */
function ensureSid(request: NextRequest, response: NextResponse): NextResponse {
  if (isValidSid(request.cookies.get(SID_COOKIE)?.value)) {
    return response
  }
  response.cookies.set({
    name: SID_COOKIE,
    value: generateSid(),
    maxAge: SID_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    httpOnly: false,
  })
  return response
}

const isRoomPath = (pathname: string): boolean =>
  pathname === '/room' || pathname.startsWith('/room/')

/** `/room/*` gate (RQ-L5): a valid `name` cookie is required, otherwise `/login?callback=<path>`. */
function roomGate(request: NextRequest): NextResponse {
  const name = request.cookies.get('name')?.value

  if (!isValidName(name)) {
    const url = new URL(request.url)
    url.pathname = '/login'
    url.searchParams.set('callback', request.nextUrl.pathname)
    return ensureSid(request, NextResponse.redirect(url))
  }
  return ensureSid(request, NextResponse.next())
}

/**
 * 1. On the Vercel production deployment, any host other than the canonical ones (the
 *    `*.vercel.app` aliases) is 308-redirected to the same path on the canonical origin, so
 *    duplicates consolidate into www instead of competing with it.
 * 2. Rooms go through the name gate.
 * 3. `X-Robots-Tag: noindex` on rooms (bots get the 307 to /login, never the room's meta) and
 *    on every response of a non-production deployment. Decided per request from the runtime
 *    environment, the same source of truth as robots.txt.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? request.nextUrl.host
  if (isVercelProduction() && !isProductionHost(host)) {
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, SITE_URL)
    return NextResponse.redirect(target, 308)
  }

  const room = isRoomPath(request.nextUrl.pathname)
  const response = room ? roomGate(request) : NextResponse.next()
  if (room || !isProductionDeployment()) {
    response.headers.set('X-Robots-Tag', X_ROBOTS_NOINDEX)
  }
  return response
}

export const config: MiddlewareConfig = {
  // every page and metadata route (robots.txt, sitemap.xml, images); not build assets or APIs
  matcher: ['/((?!_next/static|_next/image|api/).*)'],
}
