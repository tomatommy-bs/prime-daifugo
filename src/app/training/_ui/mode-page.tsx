import { JsonLdScript } from '@/components/json-ld'
import { pageMetadata } from '@/lib/site'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { MODE_INFO, type Mode } from '@/training/levels'
import Link from 'next/link'
import type { ReactNode } from 'react'

const LINK = 'text-ink underline decoration-line underline-offset-4 hover:decoration-ink'

/** Page description per mode (metadata and the server-rendered explanation). */
export const MODE_DESCRIPTION: Record<Mode, string> = {
  prime:
    'トランプのカードを並べてできた数が素数か合成数かを、10問のタイムアタックで見分ける素数大富豪の練習モードです。やさしい・ふつう・むずかしいの3段階。',
  beat: '場に出た素数より大きな素数を、手札から同じ枚数でつくる素数大富豪の練習モードです。10問のタイムアタックで、出せる手を見つける力を鍛えます。',
  factor:
    '手札から合成数とその素因数分解の式をつくる「合成数出し」の練習モードです。10問のタイムアタックで、手札を一気に減らす手を探す力を鍛えます。',
}

export const modeMetadata = (mode: Mode) =>
  pageMetadata({
    title: MODE_INFO[mode].title,
    description: MODE_DESCRIPTION[mode],
    path: MODE_INFO[mode].path,
  })

/** A mode page: breadcrumbs, the client run, and the explanation below it. */
export function ModePage({
  mode,
  children,
  howTo,
  rulesLink,
}: {
  mode: Mode
  children: ReactNode
  howTo: ReactNode
  rulesLink: { href: string; label: string }
}) {
  const info = MODE_INFO[mode]
  return (
    <div className="flex w-full flex-col gap-fib-6 pt-fib-2">
      <JsonLdScript
        data={breadcrumbJsonLd([
          { name: 'ホーム', path: '/' },
          { name: 'トレーニング', path: '/training' },
          { name: info.title, path: info.path },
        ])}
      />
      {children}
      <section
        aria-labelledby="mode-howto-title"
        className="mx-auto flex w-full max-w-[987px] flex-col gap-fib-3 text-[length:var(--fs--1)] leading-[1.75] text-ink-muted"
      >
        <h2
          id="mode-howto-title"
          className="m-0 text-[length:var(--fs-0)] font-bold leading-[1.618] text-ink"
        >
          {info.title}の遊び方
        </h2>
        {howTo}
        <p className="m-0">
          ルールは「
          <Link href={rulesLink.href} className={LINK}>
            {rulesLink.label}
          </Link>
          」を、ほかの練習は
          <Link href="/training" className={`mx-fib-1 ${LINK}`}>
            トレーニング一覧
          </Link>
          をどうぞ。
        </p>
      </section>
    </div>
  )
}

export const P = ({ children }: { children: ReactNode }) => (
  <p className="m-0 [text-wrap:pretty]">{children}</p>
)
