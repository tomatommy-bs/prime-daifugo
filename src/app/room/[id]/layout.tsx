import type { ReactNode } from 'react'

/** Full-bleed room shell (§6.4): the board owns the whole dynamic viewport. */
export default function Layout({ children }: { children: ReactNode }) {
  return <section className="min-h-dvh w-full bg-bg text-ink">{children}</section>
}
