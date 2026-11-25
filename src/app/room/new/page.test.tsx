import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('/room/new', () => {
  beforeEach(() => {
    createRoom.mockReset()
    redirect.mockReset()
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

  it('no longer imports partysocket', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).not.toMatch(/partysocket/)
  })
})
