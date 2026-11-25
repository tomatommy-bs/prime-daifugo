'use client'

import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { type ReactNode, Suspense } from 'react'

const TITLES: Record<string, string> = {
  calc: '素数判定ラボ',
}

/**
 * Labo shell: token-styled header with a back link. The design gallery renders full-bleed
 * (its scenes are whole screens), so it skips the chrome.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment()

  if (segment === 'gallery') {
    return <Suspense>{children}</Suspense>
  }

  const title = (segment && TITLES[segment]) ?? 'ラボ'

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header
        className="flex h-[52px] shrink-0 items-center gap-fib-2 pr-[calc(var(--sp-6)+var(--sp-3))] compact:h-[44px]"
        style={{
          paddingLeft: 'max(var(--sp-3), env(safe-area-inset-left))',
        }}
      >
        <Link
          href="/"
          aria-label="ホームへ戻る"
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors duration-[var(--t-sm)] hover:bg-surface hover:text-ink"
        >
          <IconArrowLeft stroke={1.5} size="1.25em" />
        </Link>
        <h1 className="m-0 truncate font-bold leading-[1.236] text-[length:var(--fs-1)]">
          {title}
        </h1>
      </header>
      <main
        className="flex flex-1 items-center justify-center pb-fib-4"
        style={{
          paddingInline: 'max(var(--sp-3), env(safe-area-inset-left), env(safe-area-inset-right))',
        }}
      >
        <Suspense>{children}</Suspense>
      </main>
    </div>
  )
}
