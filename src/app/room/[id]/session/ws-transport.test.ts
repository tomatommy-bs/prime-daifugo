import { CLOSE } from '@/shared/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READY_STATE, isByeFrame } from './transport'
import {
  ABNORMAL_CLOSE,
  BACKOFF_STEPS_MS,
  LIVENESS_TIMEOUT_MS,
  PING_INTERVAL_MS,
  RESUME_CONNECTING_GRACE_MS,
  RESUME_QUIET_MS,
  type SocketLike,
  WsTransport,
  backoffDelay,
  createWsTransport,
} from './ws-transport'

class FakeWS implements SocketLike {
  static instances: FakeWS[] = []
  static throwNext = false
  readyState: number = READY_STATE.CONNECTING
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  readonly sent: string[] = []
  readonly closeCodes: (number | undefined)[] = []
  readonly url: string
  constructor(url: string) {
    this.url = url
    if (FakeWS.throwNext) {
      FakeWS.throwNext = false
      throw new Error('bad url')
    }
    FakeWS.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close(code?: number) {
    this.closeCodes.push(code)
    this.readyState = READY_STATE.CLOSED
  }
  // server side
  open() {
    this.readyState = READY_STATE.OPEN
    this.onopen?.({})
  }
  msg(data: unknown) {
    this.onmessage?.({ data })
  }
  drop(code = 1006) {
    this.readyState = READY_STATE.CLOSED
    this.onclose?.({ code })
  }
}

const last = () => {
  const ws = FakeWS.instances.at(-1)
  if (!ws) {
    throw new Error('no socket')
  }
  return ws
}

class FakeDoc extends EventTarget {
  visibilityState = 'visible'
}

function setup(random = () => 0.5) {
  const win = new EventTarget()
  const doc = new FakeDoc()
  const t = new WsTransport({
    WebSocketCtor: FakeWS,
    random,
    now: () => Date.now(),
    win: win as never,
    doc: doc as never,
  })
  const events: string[] = []
  const closes: [number, boolean][] = []
  const messages: string[] = []
  t.onOpen = () => events.push('open')
  t.onClose = (code, reconnecting) => {
    events.push('close')
    closes.push([code, reconnecting])
  }
  t.onMessage = (text) => messages.push(text)
  t.onError = () => events.push('error')
  return { t, win, doc, events, closes, messages }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  FakeWS.instances = []
  FakeWS.throwNext = false
})
afterEach(() => {
  vi.useRealTimers()
})

describe('backoffDelay', () => {
  it('follows 0.5, 1, 2, 4, 8, 10 s and caps at 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map((a) => backoffDelay(a, 0.5))).toEqual([
      500, 1000, 2000, 4000, 8000, 10_000, 10_000, 10_000,
    ])
  })

  it('stays within ±30 % jitter', () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const base = BACKOFF_STEPS_MS[Math.min(attempt, 5)]
      expect(backoffDelay(attempt, 0)).toBe(Math.round(base * 0.7))
      expect(backoffDelay(attempt, 0.999999)).toBeLessThanOrEqual(Math.round(base * 1.3))
      for (let i = 0; i < 50; i += 1) {
        const d = backoffDelay(attempt, Math.random())
        expect(d).toBeGreaterThanOrEqual(Math.floor(base * 0.7))
        expect(d).toBeLessThanOrEqual(Math.ceil(base * 1.3))
      }
    }
  })
})

describe('WsTransport', () => {
  it('connects, reports open, forwards frames and swallows pong', () => {
    const { t, events, messages } = setup()
    expect(t.readyState).toBe(READY_STATE.CLOSED)
    t.connect('ws://x/rooms/1/ws')
    expect(last().url).toBe('ws://x/rooms/1/ws')
    expect(t.readyState).toBe(READY_STATE.CONNECTING)
    expect(t.send('early')).toBe(false)
    last().open()
    expect(events).toEqual(['open'])
    expect(t.send('hi')).toBe(true)
    expect(last().sent).toEqual(['hi'])
    last().msg('pong')
    last().msg('{"t":"ack"}')
    expect(messages).toEqual(['{"t":"ack"}'])
  })

  it('reconnects with jittered backoff after non-terminal closes', () => {
    const { t, closes } = setup(() => 0)
    t.connect('ws://x')
    last().drop(1006)
    expect(closes).toEqual([[1006, true]])
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(349)
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWS.instances).toHaveLength(2)
    // second failure: 1000 × 0.7
    last().drop(1006)
    vi.advanceTimersByTime(699)
    expect(FakeWS.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWS.instances).toHaveLength(3)
    // a successful open resets the attempt counter
    last().open()
    last().drop(1001)
    vi.advanceTimersByTime(350)
    expect(FakeWS.instances).toHaveLength(4)
  })

  it.each(Object.entries(CLOSE))('does not reconnect after terminal close %s (%i)', (_, code) => {
    const { t, closes, win } = setup()
    t.connect('ws://x')
    last().open()
    last().drop(code)
    expect(closes).toEqual([[code, false]])
    vi.advanceTimersByTime(60_000)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(1)
  })

  it('does not reconnect after a bye frame, whatever the close code', () => {
    const { t, closes, messages } = setup()
    t.connect('ws://x')
    last().open()
    last().msg('{"t":"bye","reason":"superseded"}')
    expect(messages).toHaveLength(1)
    last().drop(1006)
    expect(closes).toEqual([[1006, false]])
    vi.advanceTimersByTime(60_000)
    expect(FakeWS.instances).toHaveLength(1)
  })

  it('connect() after a terminal close starts again', () => {
    const { t } = setup()
    t.connect('ws://x')
    last().drop(CLOSE.superseded)
    t.connect('ws://x')
    expect(FakeWS.instances).toHaveLength(2)
    last().drop(1006)
    vi.advanceTimersByTime(10_000)
    expect(FakeWS.instances).toHaveLength(3)
  })

  it('sends ping every 20 s while open', () => {
    const { t } = setup()
    t.connect('ws://x')
    last().open()
    vi.advanceTimersByTime(PING_INTERVAL_MS - 1)
    expect(last().sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(last().sent).toEqual(['ping'])
    last().msg('pong')
    vi.advanceTimersByTime(PING_INTERVAL_MS)
    expect(last().sent).toEqual(['ping', 'ping'])
  })

  it('force-reconnects when no frame arrives for 45 s', () => {
    const { t, closes } = setup()
    t.connect('ws://x')
    const first = last()
    first.open()
    // frames keep it alive
    vi.advanceTimersByTime(30_000)
    first.msg('pong')
    vi.advanceTimersByTime(LIVENESS_TIMEOUT_MS - 1)
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWS.instances).toHaveLength(2)
    expect(first.closeCodes).toHaveLength(1)
    expect(closes).toEqual([[ABNORMAL_CLOSE, true]])
    // the dropped socket is detached: its late close does nothing
    first.onclose?.({ code: 1006 })
    expect(closes).toHaveLength(1)
  })

  it('reconnects at once on visible/online/pageshow(persisted) when not open', () => {
    const { t, win, doc } = setup()
    t.connect('ws://x')
    last().drop(1006)
    // in backoff (no socket): each trigger opens a socket immediately
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(2)
    last().drop(1006)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(FakeWS.instances).toHaveLength(3)
    last().drop(1006)
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    expect(FakeWS.instances).toHaveLength(4)
    // the cancelled backoff timer does not open an extra socket
    vi.advanceTimersByTime(20_000)
    last().open()
    expect(FakeWS.instances).toHaveLength(4)
  })

  it('ignores hidden visibility and non-persisted pageshow', () => {
    const { t, win, doc } = setup()
    t.connect('ws://x')
    last().drop(1006)
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('pageshow'))
    expect(FakeWS.instances).toHaveLength(1)
  })

  it('leaves a fresh open socket alone but replaces one quiet for over 25 s', () => {
    const { t, win, closes } = setup()
    t.connect('ws://x')
    last().open()
    vi.advanceTimersByTime(RESUME_QUIET_MS)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(2)
    expect(closes).toEqual([[ABNORMAL_CLOSE, true]])
  })

  it('opens one socket for the burst of resume triggers a bfcache restore fires', () => {
    const { t, win, doc, closes } = setup()
    t.connect('ws://x')
    last().open()
    // quiet for 30 s: past the resume threshold, short of the 45 s liveness drop
    vi.advanceTimersByTime(30_000)
    // pageshow(persisted), visibilitychange→visible and online, back to back
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    doc.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(2)
    expect(last().readyState).toBe(READY_STATE.CONNECTING)
    expect(closes).toEqual([[ABNORMAL_CLOSE, true]])
  })

  it('replaces a socket stuck CONNECTING for longer than the grace on resume', () => {
    const { t, win } = setup()
    t.connect('ws://x')
    vi.advanceTimersByTime(RESUME_CONNECTING_GRACE_MS)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(2)
  })

  it('reconnectNow() drops the open socket and opens a new one at once', () => {
    const { t, closes } = setup()
    t.connect('ws://x')
    last().open()
    t.reconnectNow()
    expect(FakeWS.instances).toHaveLength(2)
    expect(FakeWS.instances[0].closeCodes).toHaveLength(1)
    expect(closes).toEqual([[ABNORMAL_CLOSE, true]])
    t.close()
    t.reconnectNow()
    expect(FakeWS.instances).toHaveLength(2)
  })

  it('close() stops for good, fires nothing and removes the listeners', () => {
    const { t, win, events } = setup()
    t.connect('ws://x')
    last().open()
    t.close(1000)
    expect(last().closeCodes).toEqual([1000])
    expect(t.readyState).toBe(READY_STATE.CLOSED)
    last().drop(1000)
    win.dispatchEvent(new Event('online'))
    vi.advanceTimersByTime(60_000)
    expect(events).toEqual(['open'])
    expect(FakeWS.instances).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    // close() twice or before any connect is harmless
    t.close()
    new WsTransport({ WebSocketCtor: FakeWS, win: null, doc: null }).close()
  })

  it('close() during backoff cancels the reconnect', () => {
    const { t } = setup()
    t.connect('ws://x')
    last().drop(1006)
    t.close()
    vi.advanceTimersByTime(60_000)
    expect(FakeWS.instances).toHaveLength(1)
  })

  it('reports errors only for the current socket and survives a throwing constructor', () => {
    const { t, events, closes } = setup()
    t.connect('ws://x')
    last().onerror?.({})
    expect(events).toEqual(['error'])
    FakeWS.throwNext = true
    t.connect('ws://y')
    expect(closes).toEqual([[ABNORMAL_CLOSE, true]])
    vi.advanceTimersByTime(1000)
    expect(last().url).toBe('ws://y')
  })

  it('stringifies non-string frames', () => {
    const { t, messages } = setup()
    t.connect('ws://x')
    last().open()
    last().msg(42)
    expect(messages).toEqual(['42'])
  })

  it('handles a socket whose close throws during a forced reconnect', () => {
    const { t, win } = setup()
    t.connect('ws://x')
    last().close = () => {
      throw new Error('boom')
    }
    last().open()
    vi.advanceTimersByTime(RESUME_QUIET_MS + 1)
    win.dispatchEvent(new Event('online'))
    expect(FakeWS.instances).toHaveLength(2)
  })

  it('does nothing without a WebSocket implementation', () => {
    vi.stubGlobal('WebSocket', undefined)
    try {
      const t = createWsTransport({ win: null, doc: null })
      t.connect('ws://x')
      expect(t.readyState).toBe(READY_STATE.CLOSED)
      expect(t.send('x')).toBe(false)
      t.close()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('isByeFrame', () => {
  it('detects bye frames only', () => {
    expect(isByeFrame('{"t":"bye","reason":"left"}')).toBe(true)
    expect(isByeFrame('{"t":"evt","e":{"name":"bye"}}')).toBe(false)
    expect(isByeFrame('"bye"')).toBe(false)
    expect(isByeFrame('{"bye"')).toBe(false)
    expect(isByeFrame('pong')).toBe(false)
  })
})
