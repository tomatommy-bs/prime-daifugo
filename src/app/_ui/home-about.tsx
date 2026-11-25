import { IconArrowRight } from '@tabler/icons-react'
import Link from 'next/link'

const FEATURES = [
  {
    title: '登録不要・無料',
    text: '名前を入れるだけで、ブラウザからすぐに遊べます。アカウント登録もアプリのインストールもいりません。',
  },
  {
    title: '友だちと 2〜4 人で対戦',
    text: 'ルームの URL か QR コードを送れば、離れた友だちとも対戦できます。5 人目からは観戦して、次のラウンドから参加できます。',
  },
  {
    title: '素数判定はおまかせ',
    text: '出した数が素数かどうかはサーバーが自動で判定します。何枚もつなげた大きな数でも、桁を落とさず正確です。',
  },
] as const

const LINKS = [
  { href: '/rules', label: 'ルールと遊び方を読む' },
  { href: '/rules#primes', label: '覚えておくと便利な素数' },
  { href: '/rules#faq', label: 'よくある質問' },
  { href: '/labo/calc', label: '素数判定ラボで練習する' },
] as const

/**
 * What the game is, server-rendered below the first screen: the home card stays a full-height
 * app screen, and readers and crawlers who scroll get real text and links into the rules.
 */
export function HomeAbout() {
  return (
    <section
      aria-labelledby="home-about-title"
      className="mx-auto flex w-full max-w-[610px] flex-col gap-fib-4 pb-fib-7"
      style={{
        paddingInline: 'max(var(--sp-4), env(safe-area-inset-left), env(safe-area-inset-right))',
      }}
    >
      <h2
        id="home-about-title"
        className="m-0 text-[length:var(--fs-2)] font-bold leading-[1.236] text-ink"
      >
        素数大富豪とは
      </h2>
      <p className="m-0 leading-[1.75] text-ink-muted [text-wrap:pretty] [word-break:auto-phrase]">
        トランプのカードを並べて数をつくり、場より大きな素数を出し合うカードゲームです。前の人と同じ枚数で、より大きな素数を出し、最初に手札をなくした人が勝ち。素数でなくても、素因数分解の式を添えれば出せる「合成数出し」や、57
        で場を流す「グロタンディーク素数切り」もあります。
      </p>
      <ul className="m-0 grid list-none gap-fib-3 p-0">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="rounded-[var(--r-2)] border border-line bg-surface px-fib-4 py-fib-3"
          >
            <h3 className="m-0 text-[length:var(--fs-0)] font-bold leading-[1.618] text-ink">
              {f.title}
            </h3>
            <p className="m-0 text-[length:var(--fs--1)] leading-[1.75] text-ink-muted">{f.text}</p>
          </li>
        ))}
      </ul>
      <nav aria-label="ルールとラボ">
        <ul className="m-0 flex list-none flex-col gap-fib-1 p-0">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex min-h-[44px] items-center gap-fib-2 text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {l.label}
                <IconArrowRight stroke={1.5} size="1em" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
