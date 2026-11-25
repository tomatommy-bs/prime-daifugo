import Link from 'next/link'

/** Card ranks and the numbers they stand for (same as /rules §2). */
const RANKS = [
  ['A', '1'],
  ['2〜10', 'そのまま'],
  ['J', '11'],
  ['Q', '12'],
  ['K', '13'],
] as const

const LINK = 'text-ink underline decoration-line underline-offset-4 hover:decoration-ink'

/**
 * What the lab does, server-rendered below the tool: the card values, the size limit and links
 * into the rules, so the page explains itself to readers and search engines alike.
 */
export function LaboIntro() {
  return (
    <section
      aria-labelledby="labo-intro-title"
      className="mx-auto flex w-full max-w-[987px] flex-col gap-fib-3 text-[length:var(--fs--1)] leading-[1.75] text-ink-muted"
    >
      <h2
        id="labo-intro-title"
        className="m-0 text-[length:var(--fs-0)] font-bold leading-[1.618] text-ink"
      >
        素数判定ラボの使い方
      </h2>
      <p className="m-0 [text-wrap:pretty]">
        カードを選ぶと、その数字を左から順に並べた数 <i className="font-serif">n</i>{' '}
        ができ、素数かどうかをその場で判定します。素数でなければ素因数分解を表示するので、
        素数大富豪で出す前の練習や、合成数出しの式を考えるのに使えます。カードの数字は次のとおりです。
      </p>
      <dl className="m-0 flex flex-wrap gap-x-fib-4 gap-y-fib-1">
        {RANKS.map(([rank, value]) => (
          <div key={rank} className="flex items-baseline gap-fib-1">
            <dt className="num font-bold text-ink">{rank}</dt>
            <dd className="num m-0">= {value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 [text-wrap:pretty]">
        判定できるのは、ブラウザで正確に扱える約 16 桁（
        <span className="num">{Number.MAX_SAFE_INTEGER.toLocaleString()}</span>
        ）までです。それより大きな数は判定を省略することがあります（対戦中の判定には桁数の制限はありません）。
      </p>
      <p className="m-0">
        くわしくは「
        <Link href="/rules#cards" className={LINK}>
          カードと数のつくり方
        </Link>
        」と「
        <Link href="/rules#factor" className={LINK}>
          合成数出し（素因数分解）
        </Link>
        」、または
        <Link href="/rules" className={`mx-fib-1 ${LINK}`}>
          素数大富豪のルールと遊び方
        </Link>
        をどうぞ。
      </p>
    </section>
  )
}
