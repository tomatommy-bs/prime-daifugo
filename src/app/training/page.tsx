import { JsonLdScript } from '@/components/json-ld'
import { pageMetadata } from '@/lib/site'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { LEVELS, LEVEL_LABEL, MODES, MODE_INFO, QUESTIONS_PER_RUN } from '@/training/levels'
import { IconArrowRight } from '@tabler/icons-react'
import Link from 'next/link'

export const metadata = pageMetadata({
  title: 'トレーニング',
  description:
    '素数大富豪をひとりで練習できるトレーニング。素数判定、場より大きな素数づくり、合成数出し（素因数分解）の3モードを、10問のタイムアタックで鍛えられます。',
  path: '/training',
})

/** The training hub: one card per mode, server-rendered. */
export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[987px] flex-col gap-fib-4 pt-fib-2">
      <JsonLdScript
        data={breadcrumbJsonLd([
          { name: 'ホーム', path: '/' },
          { name: 'トレーニング', path: '/training' },
        ])}
      />
      <p className="m-0 text-ink-muted [text-wrap:pretty]">
        ひとりで素数大富豪の腕を磨けます。どのモードも {QUESTIONS_PER_RUN}{' '}
        問のタイムアタックで、正解数とタイムのベスト記録がこのブラウザに残ります。
      </p>
      <ol className="m-0 grid list-none grid-cols-3 gap-fib-3 p-0 portrait-phone:grid-cols-1 max-[900px]:grid-cols-1">
        {MODES.map((mode, i) => {
          const info = MODE_INFO[mode]
          return (
            <li key={mode}>
              <Link
                href={info.path}
                data-mode={mode}
                className="group flex h-full flex-col gap-fib-2 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 text-ink no-underline shadow-[var(--shadow-1)] transition-shadow duration-[var(--t-sm)] hover:shadow-[var(--shadow-2)] compact:p-fib-3"
              >
                <span className="num text-[length:var(--fs--1)] text-ink-muted">
                  モード {i + 1}
                </span>
                <h2 className="m-0 flex items-center gap-fib-1 text-[length:var(--fs-1)] font-bold leading-[1.382]">
                  {info.title}
                  <IconArrowRight
                    stroke={1.5}
                    size="1em"
                    aria-hidden="true"
                    className="ml-auto shrink-0 text-ink-muted transition-transform duration-[var(--t-sm)] group-hover:translate-x-1"
                  />
                </h2>
                <p className="m-0 text-ink-muted [text-wrap:pretty]">{info.summary}</p>
                <dl className="m-0 mt-auto grid grid-cols-[auto_1fr] gap-x-fib-2 border-t border-line pt-fib-2 text-[length:var(--fs--1)]">
                  {LEVELS.map((level) => (
                    <div key={level} className="contents">
                      <dt className="text-ink-muted">{LEVEL_LABEL[level]}</dt>
                      <dd className="m-0">{info.levels[level]}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          )
        })}
      </ol>
      <p className="m-0 text-[length:var(--fs--1)] text-ink-muted">
        カードを自由に並べて素数かどうかを確かめたいときは
        <Link
          href="/labo/calc"
          className="mx-fib-1 text-ink underline decoration-line underline-offset-4"
        >
          素数判定ラボ
        </Link>
        、ルールは
        <Link
          href="/rules"
          className="mx-fib-1 text-ink underline decoration-line underline-offset-4"
        >
          素数大富豪のルールと遊び方
        </Link>
        へ。
      </p>
    </div>
  )
}
