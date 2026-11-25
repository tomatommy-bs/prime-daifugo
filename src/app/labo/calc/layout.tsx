import { JsonLdScript } from '@/components/json-ld'
import { pageMetadata } from '@/lib/site'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import type { ReactNode } from 'react'
import { LaboIntro } from './intro'

export const metadata = pageMetadata({
  title: '素数判定ラボ',
  description:
    'トランプのカードを並べてできた数が素数かどうかをその場で判定し、合成数なら素因数分解を表示します。素数大富豪の練習や、出せる素数探しに使えます。',
  path: '/labo/calc',
})

const LABO_CRUMBS = [
  { name: 'ホーム', path: '/' },
  { name: '素数判定ラボ', path: '/labo/calc' },
] as const

/**
 * Metadata, breadcrumb JSON-LD and the server-rendered explanation; the labo shell
 * (`../layout.tsx`) is a client component.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-fib-6">
      <JsonLdScript data={breadcrumbJsonLd(LABO_CRUMBS)} />
      {children}
      <LaboIntro />
    </div>
  )
}
