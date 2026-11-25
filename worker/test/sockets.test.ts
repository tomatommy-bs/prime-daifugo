import { describe, expect, it } from 'vitest'
import { DurableObjectSockets, freshAttachment, lastActivityAt } from '../src/sockets'

class FakeWs {
  readyState = 1
  attachment: unknown = null
  sent: string[] = []
  closed: [number, string | undefined] | null = null
  throwOnIo = false
  serializeAttachment(a: unknown) {
    this.attachment = structuredClone(a)
  }
  deserializeAttachment() {
    return this.attachment
  }
  send(text: string) {
    if (this.throwOnIo) {
      throw new Error('closed')
    }
    this.sent.push(text)
  }
  close(code: number, reason?: string) {
    if (this.throwOnIo) {
      throw new Error('closed')
    }
    this.closed = [code, reason]
  }
}

function setup() {
  const sockets: FakeWs[] = []
  const auto = new Map<FakeWs, Date>()
  const ctx = {
    getWebSockets: () => sockets,
    getWebSocketAutoResponseTimestamp: (ws: FakeWs) => auto.get(ws) ?? null,
  }
  const registry = new DurableObjectSockets(ctx as unknown as DurableObjectState)
  return { sockets, auto, registry }
}

describe('DurableObjectSockets', () => {
  it('wraps sockets stably and persists attachments through serializeAttachment', () => {
    const t = setup()
    const ws = new FakeWs()
    t.sockets.push(ws)
    const s = t.registry.wrap(ws as unknown as WebSocket)
    expect(t.registry.wrap(ws as unknown as WebSocket)).toBe(s)
    expect(s.attachment).toEqual(freshAttachment(0))
    s.setAttachment({ ...freshAttachment(5), pid: 'p1', connNo: 2 })
    expect(ws.attachment).toMatchObject({ pid: 'p1', connNo: 2, acceptedAt: 5 })
    // after hibernation a new registry reads the attachment back
    const again = new DurableObjectSockets({
      getWebSockets: () => t.sockets,
      getWebSocketAutoResponseTimestamp: () => null,
    } as unknown as DurableObjectState)
    expect(again.all()[0]?.attachment).toMatchObject({ pid: 'p1', connNo: 2 })
  })

  it('lists only open sockets', () => {
    const t = setup()
    const open = new FakeWs()
    const closing = new FakeWs()
    closing.readyState = 2
    t.sockets.push(open, closing)
    expect(t.registry.all()).toHaveLength(1)
  })

  it('sends, closes and swallows errors from closed sockets', () => {
    const t = setup()
    const ws = new FakeWs()
    const s = t.registry.wrap(ws as unknown as WebSocket)
    s.send('x')
    s.close(4001, 'superseded')
    expect(ws.sent).toEqual(['x'])
    expect(ws.closed).toEqual([4001, 'superseded'])
    ws.throwOnIo = true
    expect(() => s.send('y')).not.toThrow()
    expect(() => s.close(1000)).not.toThrow()
  })

  it('reads the auto-response timestamp for the liveness sweep', () => {
    const t = setup()
    const ws = new FakeWs()
    const s = t.registry.wrap(ws as unknown as WebSocket)
    s.setAttachment({ ...freshAttachment(100), lastMessageAt: 200 })
    expect(s.autoResponseAt()).toBeNull()
    expect(lastActivityAt(s)).toBe(200)
    t.auto.set(ws, new Date(900))
    expect(s.autoResponseAt()).toBe(900)
    expect(lastActivityAt(s)).toBe(900)
  })
})
