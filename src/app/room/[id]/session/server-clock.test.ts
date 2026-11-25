import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTurnClock } from '../_ui/board/TurnTimer'
import { CLOCK_TICK_MS, OFFSET_ALPHA, createServerClock } from './server-clock'

describe('createServerClock', () => {
  let local = 1_000_000
  const now = () => local

  beforeEach(() => {
    vi.useFakeTimers()
    local = 1_000_000
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('offset is 0 before any sample, then the first sample, then an EMA', () => {
    const sc = createServerClock(createTurnClock(), { now })
    expect(sc.offset()).toBe(0)
    sc.sample(local + 5000)
    expect(sc.offset()).toBe(5000)
    sc.sample(local + 6000)
    expect(sc.offset()).toBeCloseTo(5000 + OFFSET_ALPHA * 1000)
    expect(sc.serverNow()).toBeCloseTo(local + 5200)
  })

  it('renders whole seconds left with the server skew applied', () => {
    const clock = createTurnClock()
    const sc = createServerClock(clock, { now })
    // the server is 30 s ahead of this device
    sc.sample(local + 30_000)
    sc.setDeadline(local + 30_000 + 15_000)
    expect(clock.get()).toBe(15)
    local += 400
    vi.advanceTimersByTime(CLOCK_TICK_MS)
    // 14.6 s left → ceil → 15
    expect(clock.get()).toBe(15)
    local += 1000
    vi.advanceTimersByTime(CLOCK_TICK_MS)
    expect(clock.get()).toBe(14)
  })

  it('a device clock behind the server shows the same seconds as the server', () => {
    const clock = createTurnClock()
    const sc = createServerClock(clock, { now })
    sc.sample(local - 90_000)
    sc.setDeadline(local - 90_000 + 10_000)
    expect(clock.get()).toBe(10)
  })

  it('never goes below 0', () => {
    const clock = createTurnClock()
    const sc = createServerClock(clock, { now })
    sc.setDeadline(local + 1500)
    expect(clock.get()).toBe(2)
    local += 5000
    vi.advanceTimersByTime(CLOCK_TICK_MS)
    expect(clock.get()).toBe(0)
    expect(sc.secondsLeft(local - 10_000)).toBe(0)
  })

  it('ticks only while a deadline is set and shows null without one', () => {
    const clock = createTurnClock(7)
    const setI = vi.fn((fn: () => void, ms: number) => setInterval(fn, ms))
    const clearI = vi.fn((id: ReturnType<typeof setInterval>) => clearInterval(id))
    const sc = createServerClock(clock, { now, setInterval: setI, clearInterval: clearI })
    sc.setDeadline(null)
    expect(setI).not.toHaveBeenCalled()
    expect(clock.get()).toBeNull()

    sc.setDeadline(local + 60_000)
    sc.setDeadline(local + 20_000)
    expect(setI).toHaveBeenCalledTimes(1)
    expect(clock.get()).toBe(20)

    sc.setDeadline(null)
    expect(clearI).toHaveBeenCalledTimes(1)
    expect(clock.get()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a new sample re-renders a running countdown at once', () => {
    const clock = createTurnClock()
    const sc = createServerClock(clock, { now })
    sc.setDeadline(local + 20_000)
    expect(clock.get()).toBe(20)
    sc.sample(local + 10_000)
    expect(clock.get()).toBe(10)
  })

  it('dispose stops the interval', () => {
    const sc = createServerClock(createTurnClock(), { now })
    sc.setDeadline(local + 20_000)
    expect(vi.getTimerCount()).toBe(1)
    sc.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('defaults to Date.now and the global timers', () => {
    vi.setSystemTime(50_000)
    const clock = createTurnClock()
    const sc = createServerClock(clock)
    sc.setDeadline(60_000)
    expect(clock.get()).toBe(10)
    vi.advanceTimersByTime(3000)
    expect(clock.get()).toBe(7)
    sc.dispose()
  })
})
