import { SID_COOKIE, SID_RE } from '@/shared/ids'
import Cookies from 'js-cookie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrCreateSid } from './session-id'

const VALID_A = 'A'.repeat(43)
const VALID_B = `${'b'.repeat(42)}_`

function clearAll() {
  Cookies.remove(SID_COOKIE, { path: '/' })
  localStorage.clear()
}

describe('getOrCreateSid', () => {
  beforeEach(clearAll)
  afterEach(() => {
    vi.restoreAllMocks()
    clearAll()
  })

  it('keeps a valid cookie and mirrors it into localStorage', () => {
    Cookies.set(SID_COOKIE, VALID_A)
    expect(getOrCreateSid()).toBe(VALID_A)
    expect(localStorage.getItem(SID_COOKIE)).toBe(VALID_A)
  })

  it('prefers the cookie over a different localStorage value', () => {
    Cookies.set(SID_COOKIE, VALID_A)
    localStorage.setItem(SID_COOKIE, VALID_B)
    expect(getOrCreateSid()).toBe(VALID_A)
    expect(localStorage.getItem(SID_COOKIE)).toBe(VALID_A)
  })

  it('restores the cookie from localStorage when the cookie was cleared', () => {
    localStorage.setItem(SID_COOKIE, VALID_B)
    expect(getOrCreateSid()).toBe(VALID_B)
    expect(Cookies.get(SID_COOKIE)).toBe(VALID_B)
  })

  it('replaces an invalid cookie with the localStorage value', () => {
    Cookies.set(SID_COOKIE, 'not-a-sid')
    localStorage.setItem(SID_COOKIE, VALID_B)
    expect(getOrCreateSid()).toBe(VALID_B)
    expect(Cookies.get(SID_COOKIE)).toBe(VALID_B)
  })

  it('generates a sid when neither store holds a valid one, and writes both', () => {
    Cookies.set(SID_COOKIE, 'bad')
    localStorage.setItem(SID_COOKIE, 'also-bad')
    const sid = getOrCreateSid()
    expect(sid).toMatch(SID_RE)
    expect(Cookies.get(SID_COOKIE)).toBe(sid)
    expect(localStorage.getItem(SID_COOKIE)).toBe(sid)
    expect(getOrCreateSid()).toBe(sid)
  })

  it('sets the cookie for 365 days, SameSite=Lax, path /', () => {
    const set = vi.spyOn(Cookies, 'set')
    getOrCreateSid()
    expect(set).toHaveBeenCalledWith(
      SID_COOKIE,
      expect.stringMatching(SID_RE),
      expect.objectContaining({ expires: 365, sameSite: 'Lax', path: '/', secure: false }),
    )
  })

  it('survives blocked localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const sid = getOrCreateSid()
    expect(sid).toMatch(SID_RE)
    expect(Cookies.get(SID_COOKIE)).toBe(sid)
  })

  it('survives blocked cookies by falling back to localStorage', () => {
    vi.spyOn(Cookies, 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Cookies, 'set').mockImplementation(() => {
      throw new Error('blocked')
    })
    localStorage.setItem(SID_COOKIE, VALID_B)
    expect(getOrCreateSid()).toBe(VALID_B)
  })

  it('still returns a fresh sid when every store is blocked', () => {
    vi.spyOn(Cookies, 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Cookies, 'set').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getOrCreateSid()).toMatch(SID_RE)
  })
})
