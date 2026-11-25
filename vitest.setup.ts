import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { afterEach, vi } from 'vitest'

// Animations resolve instantly in unit tests; components still render their final state.
MotionGlobalConfig.skipAnimations = true

/* ------------------------------------------------------------------ */
/* matchMedia: configurable through `mockMatchMedia(map)` (test-utils) */
/* ------------------------------------------------------------------ */

type Listener = (event: MediaQueryListEvent) => void
type MatchMediaState = {
  map: Record<string, boolean>
  lists: Set<{ query: string; listeners: Set<Listener>; mql: MediaQueryList }>
}

const matchMediaState: MatchMediaState = { map: {}, lists: new Set() }

// framer-motion asks for the bare feature query; treat it as the `: reduce` form.
const ALIASES: Record<string, string> = {
  '(prefers-reduced-motion)': '(prefers-reduced-motion: reduce)',
}
const evaluate = (query: string) => {
  const q = query.trim()
  return matchMediaState.map[q] ?? matchMediaState.map[ALIASES[q] ?? ''] ?? false
}

const matchMediaImpl = (query: string): MediaQueryList => {
  const listeners = new Set<Listener>()
  const legacy = new Map<unknown, Listener>()
  const mql = {
    get matches() {
      return evaluate(query)
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => {
      legacy.set(listener, listener)
      listeners.add(listener)
    },
    removeListener: (listener: Listener) => {
      const l = legacy.get(listener)
      if (l) listeners.delete(l)
    },
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
  matchMediaState.lists.add({ query, listeners, mql })
  return mql
}

/** Replace the active media-query answers and notify live MediaQueryLists. */
export const setMatchMedia = (map: Record<string, boolean>) => {
  matchMediaState.map = { ...map }
  for (const entry of matchMediaState.lists) {
    const event = { matches: evaluate(entry.query), media: entry.query } as MediaQueryListEvent
    for (const listener of entry.listeners) listener(event)
    entry.mql.onchange?.(event)
  }
}
;(globalThis as Record<string, unknown>).__setMatchMedia = setMatchMedia

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn(matchMediaImpl),
})

/* ------------------------------------------------------------------ */
/* Browser API polyfills jsdom lacks                                   */
/* ------------------------------------------------------------------ */

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
})
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
})
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
})
Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
})

window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
if (!window.HTMLElement.prototype.scrollTo) {
  window.HTMLElement.prototype.scrollTo = function scrollTo() {}
}

// jsdom throws "Not implemented" for pseudo elements; ignore the pseudo argument instead.
const originalGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((elt: Element) => originalGetComputedStyle(elt)) as typeof getComputedStyle

afterEach(() => {
  cleanup()
  // Live lists are kept: libraries (framer-motion) subscribe once per module lifetime.
  setMatchMedia({})
})
