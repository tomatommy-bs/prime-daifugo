'use client'

import { MODES, MODE_INFO, type Mode } from '@/training/levels'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { type ReactNode, Suspense } from 'react'

const isMode = (segment: string | null): segment is Mode =>
  segment !== null && (MODES as readonly string[]).includes(segment)

/**
 * Training shell: the labo-style header. A mode page links back to the training hub, the hub
 * back home.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment()
  const mode = isMode(segment) ? segment : null
  const title = mode ? MODE_INFO[mode].title : 'トレーニング'
  const back = mode
    ? { href: '/training', label: 'トレーニング一覧へ戻る' }
    : { href: '/', label: 'ホームへ戻る' }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header
        className="flex h-[52px] shrink-0 items-center gap-fib-2 pr-[calc(var(--sp-6)+var(--sp-3))] compact:h-[44px]"
        style={{ paddingLeft: 'max(var(--sp-3), env(safe-area-inset-left))' }}
      >
        <Link
          href={back.href}
          aria-label={back.label}
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors duration-[var(--t-sm)] hover:bg-surface hover:text-ink"
        >
          <IconArrowLeft stroke={1.5} size="1.25em" />
        </Link>
        <h1 className="m-0 truncate font-bold leading-[1.236] text-[length:var(--fs-1)]">
          {title}
        </h1>
      </header>
      <main
        className="flex flex-1 justify-center pb-fib-4"
        style={{
          paddingInline: 'max(var(--sp-3), env(safe-area-inset-left), env(safe-area-inset-right))',
        }}
      >
        <Suspense>{children}</Suspense>
      </main>
    </div>
  )
}
