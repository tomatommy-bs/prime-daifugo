'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Content-box size of an element through a callback ref and a ResizeObserver.
 * Unlike a mount-time `useRef` observer it follows elements that mount later, e.g. the
 * SeatRing table that only renders once the layout mode resolves to `wide`.
 */
export function useBoxSize<T extends HTMLElement = HTMLDivElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) {
      return
    }
    const update = (width: number, height: number) =>
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    update(el.clientWidth, el.clientHeight)
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    observer.current = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) {
        update(Math.round(box.width), Math.round(box.height))
      }
    })
    observer.current.observe(el)
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return { ref, ...size }
}
