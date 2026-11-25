'use client'

import { useEffect, useState } from 'react'

export type LayoutMode = 'compact' | 'portrait' | 'regular' | 'wide'

/** Media queries behind each layout mode (§4). Tailwind custom variants mirror these. */
export const LAYOUT_QUERIES = {
  compact: '(orientation: landscape) and (max-height: 500px)',
  portrait: '(orientation: portrait) and (max-width: 600px)',
  wide: '(min-width: 1280px) and (min-height: 720px)',
} as const

/** Mode used during SSR and before the first effect. */
export const SSR_LAYOUT_MODE: LayoutMode = 'regular'

/** Resolve the mode from a query predicate. Priority: compact > portrait > wide > regular. */
export function resolveLayoutMode(matches: (query: string) => boolean): LayoutMode {
  if (matches(LAYOUT_QUERIES.compact)) {
    return 'compact'
  }
  if (matches(LAYOUT_QUERIES.portrait)) {
    return 'portrait'
  }
  if (matches(LAYOUT_QUERIES.wide)) {
    return 'wide'
  }
  return 'regular'
}

const readMode = (): LayoutMode => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return SSR_LAYOUT_MODE
  }
  return resolveLayoutMode((q) => window.matchMedia(q).matches)
}

/** The current layout mode, updated live from `window.matchMedia`. SSR returns `'regular'`. */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(SSR_LAYOUT_MODE)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }
    const lists = Object.values(LAYOUT_QUERIES).map((q) => window.matchMedia(q))
    const update = () => setMode(readMode())
    update()
    for (const mql of lists) {
      mql.addEventListener('change', update)
    }
    return () => {
      for (const mql of lists) {
        mql.removeEventListener('change', update)
      }
    }
  }, [])

  return mode
}
