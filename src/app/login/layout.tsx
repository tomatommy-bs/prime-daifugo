import { UlamField } from '@/design/UlamField'
import { privatePageMetadata } from '@/lib/site'
import { type ReactNode, Suspense } from 'react'

/**
 * The name gate in front of every room: useful to players, useless in search results. Link
 * previewers carry no `name` cookie, so a shared room link is previewed through this page.
 */
export const metadata = privatePageMetadata({
  title: 'プレイヤー名の入力',
  share: {
    title: '素数大富豪で対戦しよう',
    description:
      'リンクを開いて名前を入力すると、ルームに参加できます。登録不要・無料で、ブラウザから遊べる素数のカードゲームです。',
  },
})

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
