'use client'

import { SieveGrid } from '@/design/SieveGrid'
import { DUR, useMotionMode } from '@/design/motion'
import { useEffect, useState } from 'react'

const PASSES = [2, 3, 5, 7]
// One cycle: four passes of 233 ms with 144 ms gaps, then a beat to read the result.
const CYCLE_MS = Math.round((PASSES.length * (DUR.md + DUR.sm) + DUR.xxl) * 1000)

/**
 * `/room/new` is a server fetch + redirect (page.tsx is untouched); while it runs, the sieve
 * strikes out 2, 3, 5, 7 and starts over (§7.3). Static under reduced motion.
 */
export default function Loading() {
  const mode = useMotionMode()
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (mode === 'reduced') {
      return
    }
    const id = window.setInterval(() => setCycle((c) => c + 1), CYCLE_MS)
    return () => window.clearInterval(id)
  }, [mode])

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-fib-4 px-fib-4"
      data-motion={mode}
    >
      <div
        className="rounded-[var(--r-3)] p-fib-4"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-2)' }}
      >
        <SieveGrid
          key={cycle}
          n={100}
          cols={10}
          size={22}
          animate={true}
          passes={PASSES}
          className="block h-auto w-[min(220px,60vmin)]"
        />
      </div>
      <output aria-live="polite" className="text-ink-muted">
        部屋を探しています…
      </output>
    </main>
  )
}
