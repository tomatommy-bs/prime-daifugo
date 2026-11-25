import { UlamField } from '@/design/UlamField'
import { type ReactNode, Suspense } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-fib-3 py-fib-5">
      {/* Decorative Ulam spiral behind the card, faded towards the edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-40"
        style={{
          maskImage: 'radial-gradient(closest-side, #000 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(closest-side, #000 30%, transparent 100%)',
        }}
      >
        <UlamField side={31} cell={14} className="h-[100vmax] w-[100vmax] max-w-none shrink-0" />
      </div>
      <Suspense>{children}</Suspense>
    </section>
  )
}
