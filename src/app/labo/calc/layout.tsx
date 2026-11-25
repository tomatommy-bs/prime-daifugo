import { pageMetadata } from '@/lib/site'
import type { ReactNode } from 'react'

export const metadata = pageMetadata({
  title: '素数判定ラボ',
  description:
    'トランプのカードを並べてできた数が素数かどうかをその場で判定し、合成数なら素因数分解を表示します。素数大富豪の練習や、出せる素数探しに使えます。',
  path: '/labo/calc',
})

/** Metadata only: the labo shell (`../layout.tsx`) is a client component. */
export default function Layout({ children }: { children: ReactNode }) {
  return children
}
