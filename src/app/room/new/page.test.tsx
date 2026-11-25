import { RealtimeHttpError } from '@/lib/realtime-http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewRoomPage, { dynamic } from './page'

const createRoom = vi.hoisted(() => vi.fn<() => Promise<{ roomId: string }>>())
vi.mock('@/lib/realtime-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/realtime-http')>()),
  createRoom,
}))

// next/navigation's redirect() throws a control-flow error; mimic that.
class RedirectSignal extends Error {
  readonly url: string
  constructor(url: string) {
    super(`NEXT_REDIRECT ${url}`)
    this.url = url
  }
}
const redirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect }))
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }))
vi.mock('next/headers', () => ({ headers: () => requestHeaders.value }))

describe('/room/new', () => {
  beforeEach(() => {
    createRoom.mockReset()
    redirect.mockReset()
    requestHeaders.value = new Headers()
    redirect.mockImplementation((url: string) => {
      throw new RedirectSignal(url)
    })
  })

  it('redirects to the room id the backend allocated', async () => {
    createRoom.mockResolvedValue({ roomId: '1009' })
    await expect(NewRoomPage()).rejects.toBeInstanceOf(RedirectSignal)
    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith('/room/1009')
  })

  it('passes the visitor IP so the Worker rate-limits per visitor', async () => {
    requestHeaders.value = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    createRoom.mockResolvedValue({ roomId: '1009' })
    await expect(NewRoomPage()).rejects.toBeInstanceOf(RedirectSignal)
    expect(createRoom).toHaveBeenCalledWith({ clientIp: '203.0.113.7' })
  })

  it('throws on an HTTP error so error.tsx shows', async () => {
    const error = new RealtimeHttpError('POST /rooms returned 503', 503)
    createRoom.mockRejectedValue(error)
    await expect(NewRoomPage()).rejects.toBe(error)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('throws on a timeout so error.tsx shows', async () => {
    createRoom.mockRejectedValue(new RealtimeHttpError('POST /rooms timed out'))
    await expect(NewRoomPage()).rejects.toThrow(/timed out/)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('is always rendered dynamically', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})
