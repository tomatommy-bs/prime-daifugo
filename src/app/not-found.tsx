import { SieveGrid } from '@/design/SieveGrid'
import { IconArrowRight, IconHome } from '@tabler/icons-react'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * No robots field: Next.js already adds `noindex` to the 404 response, and the root layout
 * sets none, so the page carries exactly one robots meta.
 */
export const metadata: Metadata = {
  title: 'ページが見つかりません',
}

const ICON = { stroke: 1.5, size: '1.25em' } as const

const LINK =
  'inline-flex min-h-[44px] items-center justify-center gap-fib-2 rounded-[var(--r-2)] px-fib-4 font-bold no-underline transition-colors duration-[var(--t-sm)]'

/** 404 for every unknown URL: say so in Japanese and point at the home page and the rules. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-fib-4 text-ink">
      <section
        aria-labelledby="not-found-title"
        className="flex w-full max-w-[377px] flex-col items-center gap-fib-4 rounded-[var(--r-3)] p-fib-5 text-center"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-2)' }}
      >
        <SieveGrid n={30} cols={10} size={14} primeOpacity={0.25} className="opacity-70" />
        <p className="num m-0 text-[length:var(--fs--1)] tracking-[0.12em] text-ink-muted">404</p>
        <h1
          id="not-found-title"
          className="m-0 font-bold"
          style={{ fontSize: 'var(--fs-1)', lineHeight: 1.236 }}
        >
          ページが見つかりません
        </h1>
        <p className="m-0 text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
          URL が間違っているか、ページが移動または削除された可能性があります。
        </p>
        <nav aria-label="おすすめのページ" className="grid w-full grid-cols-2 gap-fib-3">
          <Link href="/" className={`${LINK} bg-prime text-on-prime hover:opacity-90`}>
            <IconHome {...ICON} />
            ホームへ
          </Link>
          <Link
            href="/rules"
            className={`${LINK} border border-border-strong text-ink hover:bg-bg`}
          >
            ルールを読む
            <IconArrowRight {...ICON} />
          </Link>
        </nav>
      </section>
    </main>
  )
}
