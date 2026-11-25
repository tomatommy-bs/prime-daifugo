import { privatePageMetadata } from '@/lib/site'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/** Rooms are private, short-lived tables: a title for the tab, never indexed. */
export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return privatePageMetadata({
    title: `ルーム ${params.id}`,
    share: {
      title: `素数大富豪 ルーム ${params.id} への招待`,
      description:
        'リンクを開いて名前を入力すると、このルームに参加できます。登録不要・無料で、ブラウザから遊べます。',
    },
  })
}

/** Full-bleed room shell (§6.4): the board owns the whole dynamic viewport. */
export default function Layout({ children }: { children: ReactNode }) {
  return <section className="min-h-dvh w-full bg-bg text-ink">{children}</section>
}
