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

/** `/room/*` gate (RQ-L5): a valid `name` cookie is required, otherwise `/login?callback=<path>`. */
export function middleware(request: NextRequest) {
  const name = request.cookies.get('name')?.value

  if (!isValidName(name)) {
    const url = new URL(request.url)
    url.pathname = '/login'
    url.searchParams.set('callback', request.nextUrl.pathname)
    return ensureSid(request, NextResponse.redirect(url))
  }
  return ensureSid(request, NextResponse.next())
}

export const config: MiddlewareConfig = {
  matcher: ['/room/:path*'],
}
