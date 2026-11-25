import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardEvent } from './types'
import {
  DirectorCore,
  EVENT_DURATION_MS,
  HOLD_MS,
  REDUCED_MAX_MS,
  useBoardDirector,
} from './use-board-director'

const pass = (id: string): BoardEvent => ({ type: 'pass', playerId: id })
const ok: BoardEvent = { type: 'submit-ok', playerId: 'p2', cards: ['KH'], factor: [] }
const end = (winner: string | null = 'bob') => ({ type: 'end' as const, winner })

describe('useBoardDirector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays events FIFO, each for its duration', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.push(pass('a'))
      result.current.push(pass('b'))
      result.current.push({ type: 'turn', from: 'a', to: 'b' })
    })
    expect(result.current.current).toEqual(pass('a'))
    expect(result.current.queueLength).toBe(2)
    act(() => {
      vi.advanceTimersByTime(EVENT_DURATION_MS.pass)
    })
    expect(result.current.current).toEqual(pass('b'))
    act(() => {
      vi.advanceTimersByTime(EVENT_DURATION_MS.pass)
    })
    expect(result.current.current?.type).toBe('turn')
    act(() => {
      vi.advanceTimersByTime(EVENT_DURATION_MS.turn)
    })
    expect(result.current.current).toBeNull()
    expect(result.current.queueLength).toBe(0)
  })

  it('done() advances immediately', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.push(ok)
      result.current.push(pass('a'))
    })
    act(() => {
      result.current.done()
    })
    expect(result.current.current).toEqual(pass('a'))
  })

  it('holds the game end until the winning submit has played', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.holdEnd(end())
      result.current.holdEnd(end(null)) // room-status waitingNextRound
      result.current.push(ok)
    })
    expect(result.current.ended).toBeNull()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.ended).toBeNull()
    // the overlay finishes its animation and reports done
    act(() => {
      result.current.done()
    })
    expect(result.current.ended).toEqual(end('bob'))
  })

  it('a submit that plays out its full duration (reduced motion) also releases the end', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: true }))
    act(() => {
      result.current.holdEnd(end())
      result.current.push(ok)
    })
    act(() => {
      vi.advanceTimersByTime(REDUCED_MAX_MS - 1)
    })
    expect(result.current.ended).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.ended).toEqual(end('bob'))
  })

  it('releases the end after 800 ms without a submit', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.push(end(null))
    })
    act(() => {
      vi.advanceTimersByTime(HOLD_MS - 1)
    })
    expect(result.current.ended).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.ended).toEqual(end(null))
    // a late winner fills in the name
    act(() => {
      result.current.holdEnd(end('bob'))
    })
    expect(result.current.ended).toEqual(end('bob'))
  })

  it('the 800 ms cap wins over a slow submit', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.push({
        type: 'submit-fail',
        code: 'BASE_IS_NOT_PRIME',
        playerId: 'p1',
        value: 21,
        factor: [],
        penalty: 2,
      })
      result.current.holdEnd(end())
    })
    act(() => {
      vi.advanceTimersByTime(HOLD_MS)
    })
    expect(result.current.ended).toEqual(end())
    expect(result.current.current?.type).toBe('submit-fail')
  })

  it('a deal clears the previous end', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.holdEnd(end())
      vi.advanceTimersByTime(HOLD_MS)
    })
    expect(result.current.ended).not.toBeNull()
    act(() => {
      result.current.push({ type: 'deal' })
    })
    expect(result.current.ended).toBeNull()
    expect(result.current.current).toEqual({ type: 'deal' })
  })

  it('plays at 0.5x when more than 3 events wait', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        result.current.push(pass(id))
      }
    })
    expect(result.current.currentMs).toBe(EVENT_DURATION_MS.pass)
    expect(result.current.queueLength).toBe(4)
    act(() => {
      vi.advanceTimersByTime(EVENT_DURATION_MS.pass)
    })
    // b starts with c, d, e waiting (3): not yet a backlog
    expect(result.current.current).toEqual(pass('b'))
    expect(result.current.currentMs).toBe(EVENT_DURATION_MS.pass)

    act(() => {
      result.current.push(pass('f'))
      result.current.push(pass('g'))
      vi.advanceTimersByTime(EVENT_DURATION_MS.pass)
    })
    // c starts with d, e, f, g waiting (4 > 3)
    expect(result.current.current).toEqual(pass('c'))
    expect(result.current.currentMs).toBe(EVENT_DURATION_MS.pass * 0.5)
  })

  it('drops intermediate events when more than 6 wait', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        result.current.push(pass(id))
      }
    })
    // a plays; b..h (7 waiting) collapse to the latest
    expect(result.current.current).toEqual(pass('a'))
    expect(result.current.queueLength).toBe(1)
    act(() => {
      result.current.done()
    })
    expect(result.current.current).toEqual(pass('h'))
  })

  it('a dropped submit still releases a held end', () => {
    const core = new DirectorCore()
    core.holdEnd(end())
    core.push(pass('a'))
    core.push(ok)
    for (const id of ['b', 'c', 'd', 'e', 'f']) {
      core.push(pass(id))
    }
    // a plays; ok + b..f = 6 waiting: nothing dropped yet
    expect(core.ended).toBeNull()
    core.push(pass('g'))
    expect(core.queueLength).toBe(1)
    expect(core.ended).toEqual(end())
    core.dispose()
  })

  it('caps every duration at 144 ms under reduced motion', () => {
    const { result } = renderHook(() => useBoardDirector({ reduced: true }))
    const events: BoardEvent[] = [
      { type: 'deal' },
      { type: 'cut57', playerId: 'p1' },
      ok,
      { type: 'flow' },
      { type: 'draw', who: 'me', playerId: 'p1' },
    ]
    for (const e of events) {
      act(() => {
        result.current.push(e)
      })
      expect(result.current.currentMs).toBeLessThanOrEqual(REDUCED_MAX_MS)
      act(() => {
        vi.advanceTimersByTime(REDUCED_MAX_MS)
      })
      expect(result.current.current).toBeNull()
    }
  })

  it('clears timers on unmount', () => {
    const { result, unmount } = renderHook(() => useBoardDirector({ reduced: false }))
    act(() => {
      result.current.push(ok)
      result.current.holdEnd(end())
    })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
