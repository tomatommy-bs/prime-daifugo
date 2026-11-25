/**
 * Client-side session secret (spec §3.1). Browser only.
 *
 * The sid lives in the JS-readable cookie `pd_sid` (issued by the middleware) and is mirrored to
 * `localStorage['pd_sid']`, so clearing one of them does not cost a player their seat. Every
 * storage access is wrapped in try/catch (private mode, blocked storage).
 */
import { SID_COOKIE, SID_COOKIE_DAYS, generateSid, isValidSid } from '@/shared/ids'
import Cookies from 'js-cookie'

function readCookie(): string | undefined {
  try {
    return Cookies.get(SID_COOKIE)
  } catch {
    return undefined
  }
}

function writeCookie(sid: string): void {
  try {
    Cookies.set(SID_COOKIE, sid, {
      expires: SID_COOKIE_DAYS,
      sameSite: 'Lax',
      secure: globalThis.location?.protocol === 'https:',
      path: '/',
    })
  } catch {
    // cookies unavailable: localStorage (or the in-memory value) still identifies this tab
  }
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(SID_COOKIE) ?? null
  } catch {
    return null
  }
}

function writeStorage(sid: string): void {
  try {
    globalThis.localStorage?.setItem(SID_COOKIE, sid)
  } catch {
    // storage blocked: the cookie alone keeps the sid
  }
}

/**
 * The sid for this browser, in order of preference:
 * 1. a valid `pd_sid` cookie (mirrored into localStorage);
 * 2. a valid sid in localStorage (restored into the cookie);
 * 3. a freshly generated sid (written to both).
 */
export function getOrCreateSid(): string {
  const fromCookie = readCookie()
  if (isValidSid(fromCookie)) {
    if (readStorage() !== fromCookie) {
      writeStorage(fromCookie)
    }
    return fromCookie
  }
  const fromStorage = readStorage()
  if (isValidSid(fromStorage)) {
    writeCookie(fromStorage)
    return fromStorage
  }
  const sid = generateSid()
  writeCookie(sid)
  writeStorage(sid)
  return sid
}
