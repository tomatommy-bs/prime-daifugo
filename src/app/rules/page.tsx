import { JsonLdScript } from '@/components/json-ld'
import { SieveGrid } from '@/design/SieveGrid'
import { EXTERNAL_URLS, pageMetadata } from '@/lib/site'
import { breadcrumbJsonLd, faqJsonLd, howToJsonLd } from '@/lib/structured-data'
import { ALLOWED_RULES } from '@/shared/rule-options'
import { IconArrowLeft, IconArrowRight, IconArrowUpRight } from '@tabler/icons-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  DEFAULTS,
  FAQS,
  HOW_TO_STEPS,
  RULES_CRUMBS,
  RULES_DESCRIPTION,
  RULES_DOC_TITLE,
  SECTIONS,
  type SectionId,
} from './content'

export const metadata = pageMetadata({
  // already starts with the site name, so no ` | 素数大富豪` suffix
  title: RULES_DOC_TITLE,
  absoluteTitle: true,
  description: RULES_DESCRIPTION,
  path: '/rules',
})

const ICON = { stroke: 1.5, size: '1.25em' } as const

/**
 * /rules: the rules of 素数大富豪 as this app implements them, how to play online and an FAQ.
 * Server-rendered and static, so the whole text is in the HTML.
 */
export default function RulesPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <JsonLdScript
        data={[
          breadcrumbJsonLd(RULES_CRUMBS),
          faqJsonLd(FAQS),
          howToJsonLd({
            name: '素数大富豪をオンラインで遊ぶ方法',
            description: '登録不要で、ブラウザから友だちと素数大富豪を始める手順です。',
            steps: HOW_TO_STEPS,
          }),
        ]}
      />
      <header
        className="flex h-[52px] items-center gap-fib-2 pr-[calc(var(--sp-6)+var(--sp-3))]"
        style={{ paddingLeft: 'max(var(--sp-3), env(safe-area-inset-left))' }}
      >
        <Link
          href="/"
          aria-label="ホームへ戻る"
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors duration-[var(--t-sm)] hover:bg-surface hover:text-ink"
        >
          <IconArrowLeft {...ICON} />
        </Link>
        <nav aria-label="パンくずリスト" className="min-w-0 text-[length:var(--fs--1)]">
          <ol className="m-0 flex list-none items-center gap-fib-1 p-0 text-ink-muted">
            <li>
              <Link href="/" className="text-ink-muted no-underline hover:text-ink">
                ホーム
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="truncate text-ink">
              ルール
            </li>
          </ol>
        </nav>
      </header>

      <main
        className="mx-auto w-full max-w-[46rem] pt-fib-4 pb-fib-7"
        style={{
          paddingInline: 'max(var(--sp-4), env(safe-area-inset-left), env(safe-area-inset-right))',
        }}
      >
        <article className="flex flex-col gap-fib-6">
          <header className="flex flex-col gap-fib-3">
            <SieveGrid
              n={60}
              cols={30}
              size={12}
              primeOpacity={0.25}
              className="block h-auto w-full max-w-[377px]"
            />
            <p className="num m-0 text-[length:var(--fs--1)] tracking-[0.12em] text-ink-muted">
              PRIME DAIFUGŌ · RULES
            </p>
            <h1 className="m-0 text-[length:var(--fs-5)] font-bold leading-[1.236] tracking-[0.04em] portrait-phone:text-[length:var(--fs-4)]">
              {/* break between the phrases, never inside ルール */}
              <span className="inline-block">素数大富豪の</span>
              <span className="inline-block">ルールと遊び方</span>
            </h1>
            <p className="m-0 text-[length:var(--fs-1)] leading-[1.618] text-ink-muted portrait-phone:text-[length:var(--fs-0)] portrait-phone:leading-[1.75]">
              素数大富豪は、トランプのカードを並べて数をつくり、場より大きな
              <strong className="font-bold text-prime">素数</strong>
              を出し合うカードゲームです。このページでは、このサイトで遊べるオンライン版のルールを、はじめての人にもわかるようにまとめました。
            </p>
            <p className="m-0 text-[length:var(--fs--1)] text-ink-muted">
              もとになっているのは、素数大富豪の
              <a
                href={EXTERNAL_URLS.officialRules}
                target="_blank"
                rel="noreferrer noopener"
                className="mx-fib-1 inline-flex items-center gap-[2px] text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                公式ルール
                <IconArrowUpRight stroke={1.5} size="1em" aria-label="（外部サイト）" />
              </a>
              です。違いは「
              <a
                href="#differences"
                className="text-ink underline decoration-line underline-offset-4"
              >
                公式ルールとの違い
              </a>
              」へ。
            </p>
            <div>
              <Link
                href="/room/new"
                className="inline-flex min-h-[44px] items-center gap-fib-2 rounded-[var(--r-2)] bg-prime px-fib-4 font-bold text-on-prime no-underline shadow-[var(--shadow-1)] transition-opacity duration-[var(--t-sm)] hover:opacity-90"
              >
                ルームを作って遊ぶ
                <IconArrowRight {...ICON} />
              </Link>
            </div>
          </header>

          <Toc />

          <Section id="overview" n={1}>
            <P>
              2〜4人で遊ぶ対戦カードゲームです。手番の人は、手札のカードを並べてできる数が素数なら、その数を場に出せます。次の人がカードを出すときは、場と同じ枚数で、場の数より大きな素数にする必要があります。
            </P>
            <P>
              出せないときや出したくないときはパスします。最初に手札をすべて出し切った人の勝ちです。素数でない数を出してしまうと、ペナルティとして山札からカードを引きます。
            </P>
          </Section>

          <Section id="cards" n={2}>
            <P>ジョーカーを除いた52枚のトランプを使います。カードの数字は次のとおりです。</P>
            <Dl
              items={[
                ['A', '1'],
                ['2 〜 10', 'そのままの数'],
                ['J', '11'],
                ['Q', '12'],
                ['K', '13'],
              ]}
            />
            <P>
              何枚かのカードを並べると、数字を<strong>左から順に書き並べた数</strong>
              になります。並べる順番は自由です。
            </P>
            <Examples
              items={[
                [['Q', 'A'], '121', '12 と 1 を並べて 121（11² なので素数ではない）'],
                [['10', '3'], '103', '10 と 3 を並べて 103（素数）'],
                [['K', '7'], '137', '13 と 7 を並べて 137（素数）'],
              ]}
            />
            <Note>
              マークは数に関係しません。何十枚つなげた大きな数でも、桁を落とさず正確に判定します。
            </Note>
          </Section>

          <Section id="setup" n={3}>
            <Ul>
              <li>
                ルームで<strong>準備OK</strong>
                を押した人のうち、先着4人がプレイヤーになります。5人目以降は観戦者です。
              </li>
              <li>
                各プレイヤーに手札が{DEFAULTS.initNumCards}
                枚（初期設定）ずつ配られ、残りが山札になります。場は空の状態から始まります。
              </li>
              <li>座席の順番は配るたびにランダムで決まり、最初の席の人から始めます。</li>
            </Ul>
          </Section>

          <Section id="turn" n={4}>
            <P>自分の手番では、次の3つの行動ができます。</P>
            <Dl
              items={[
                [
                  '出す',
                  '手札から数をつくって場に出します（条件は次の節）。判定が終わると、成功でも失敗でも手番は次の人に移ります。',
                ],
                [
                  '引く',
                  '山札から1枚引きます。1回の手番で1回まで、山札が残っているときだけ引けます。引いても手番は終わらないので、そのまま出すかパスします。',
                ],
                [
                  'パス',
                  'いつでもパスできます。場が空のときでもかまいません。手番は次の人に移ります。',
                ],
              ]}
            />
          </Section>

          <Section id="submit" n={5}>
            <P>出すカードは、次の条件をすべて満たす必要があります。</P>
            <Ol>
              <li>枚数は最大提出枚数（初期設定では{DEFAULTS.maxSubmitNumCards}枚）以下。</li>
              <li>
                場にカードがあるときは、<strong>場の一番上と同じ枚数</strong>で、
                <strong>場の数より大きい</strong>数であること。
              </li>
              <li>
                その数が<strong>素数</strong>であること（例外として 57 も出せます。→
                <a
                  href="#grothendieck"
                  className="text-ink underline decoration-line underline-offset-4"
                >
                  57 切り
                </a>
                ）。
              </li>
            </Ol>
            <P>
              1 と 2
              の条件を満たさない出し方はそもそもできません（ペナルティもありません）。素数かどうかは、出してみるまで画面には表示されません。そこが腕の見せどころです。
            </P>
            <Examples
              items={[
                [['2'], '2', '場が空なら 1 枚の素数を出せる'],
                [['3', 'A'], '31', '場が 2 枚の 29 なら、2 枚の 31 を出せる'],
                [['J', '3'], '113', '同じく 2 枚で 113 も出せる'],
              ]}
            />
          </Section>

          <Section id="factor" n={6}>
            <P>
              素数でない数（合成数）でも、<strong>素因数分解の式</strong>
              を手札のカードで添えれば出せます。これを合成数出しといいます。
            </P>
            <Examples
              items={[
                [['6', '9'], '69 = 3 × 23', '6・9 で 69 を出し、3・×・2・3 で式を添える'],
                [['8', 'A'], '81 = 3⁴', '8・A で 81 を出し、3・^・4 で式を添える'],
              ]}
            />
            <P>式は次のルールで組み立てます。</P>
            <Ul>
              <li>
                数（1 枚以上のカードを並べたもの）と演算子（× と ^）を交互に置きます。2・3
                のようにカードを続けて置くと、23 という 1 つの数になります。
              </li>
              <li>演算子は 1 つ以上必要で、式の最初と最後、連続には置けません。</li>
              <li>
                値が 1 になる項は使えません。A だけの因数や「^1」は不可ですが、A・3 で 13
                のように並べるのはかまいません。
              </li>
              <li>
                累乗は 1 段だけです。底は素数、指数は 2 以上の整数です（2^3^2
                のような重ね累乗は不可）。
              </li>
              <li>式に出てくる底はすべて素数で、式の値が出した数と等しくなければなりません。</li>
              <li>
                場と同じ枚数・最大提出枚数の条件は、<strong>出す数のカードだけ</strong>
                に適用されます。式に使うカードの枚数は数えません（例：場が 2 枚なら、69 を出して 3 ×
                23 を添えられます）。
              </li>
            </Ul>
            <Note>
              形が正しくない式（演算子で始まる・終わる、演算子が続く、値が 1
              の項がある、重ね累乗など）はそもそも出せません。この場合ペナルティはありません。
            </Note>
            <P>
              成功すると、出したカードは場に置かれ、式に使ったカードは山札に戻ってシャッフルされます。式のカードも手札から減るので、一気に手札を減らすチャンスです。
            </P>
          </Section>

          <Section id="penalty" n={7}>
            <P>
              判定に失敗すると、出したカードは手札に戻り、山札からカードを引いて手番が終わります。
            </P>
            <Dl
              items={[
                ['素数でなかった', '出したカードと同じ枚数を引く'],
                [
                  '合成数出しの失敗',
                  '出したカードの枚数 ＋ 式に使ったカードの枚数を引く（素数でない因数がある、または式の値が合わない場合）',
                ],
              ]}
            />
            <Note>山札が足りないときは、残っている分だけ引きます。</Note>
          </Section>

          <Section id="flow" n={8}>
            <P>
              誰かがカードを出したあと、ほかの全員がパス（または失敗）して手番がその人に戻ってくると、
              <strong>場が流れます</strong>
              。場のカードは山札に戻ってシャッフルされ、その人が空の場に好きな枚数で出し直せます。
            </P>
          </Section>

          <Section id="grothendieck" n={9}>
            <P>
              <span className="num font-bold text-gold">57</span> は 3 × 19
              なので素数ではありませんが、「グロタンディーク素数」として特別に出せます。
            </P>
            <Ul>
              <li>57 を出すと（そのままでも、3 × 19 の合成数出しでも）すぐに場が流れます。</li>
              <li>出した人がもう一度手番を持ち、空の場から好きなカードを出せます。</li>
              <li>場の条件（同じ枚数・場より大きい数）は、ほかのカードと同じく必要です。</li>
            </Ul>
            <Note>
              画面では、出す欄の数がちょうど 57
              になると金色に変わります。出す前に数について教えてくれる表示はこれだけで、素数かどうかは表示されません。
            </Note>
          </Section>

          <Section id="end" n={10}>
            <P>
              手札を最初になくした人が勝ちです。57
              切りで上がっても勝ちになります。順位はつけず、勝者は 1
              人です。終了画面では、ほかのプレイヤーの残り枚数が表示されます。
            </P>
            <P>
              終了画面からそのまま次のラウンドの準備ができます。観戦していた人も、ここで準備OKを押せば次のラウンドに参加できます。
            </P>
          </Section>

          <Section id="time" n={11}>
            <Ul>
              <li>
                1 手番の制限時間は {ALLOWED_RULES.timeLimit.join('・')} 秒から選べます（初期設定{' '}
                {DEFAULTS.timeLimit} 秒）。場が空のときの手番にも制限時間があります。
              </li>
              <li>
                時間切れになると自動的にパスになります（場が流れる条件も通常のパスと同じです）。
              </li>
              <li>カードを引いても残り時間は戻りません。</li>
              <li>
                ゲーム中に通信が切れても、120
                秒以内に戻れば同じ席・同じ手札で続けられます。切れている間の手番は最長 20 秒です。
              </li>
              <li>
                120 秒を過ぎるか「退出」すると棄権になり、手札は山札に戻ります。残りが 1
                人になったら、その人の勝ちです。
              </li>
            </Ul>
          </Section>

          <Section id="options" n={12}>
            <P>待合室では、参加者なら誰でもルールを変更できます（ホストはいません）。</P>
            <Dl
              items={[
                [
                  '制限時間',
                  `${ALLOWED_RULES.timeLimit.join('・')} 秒（初期設定 ${DEFAULTS.timeLimit} 秒）`,
                ],
                [
                  '初期手札',
                  `${ALLOWED_RULES.initNumCards.join('・')} 枚（初期設定 ${DEFAULTS.initNumCards} 枚）`,
                ],
                [
                  '最大提出',
                  `一度に出せる枚数。${DEFAULTS.maxSubmitNumCards} 枚または無制限（初期設定 ${DEFAULTS.maxSubmitNumCards} 枚）`,
                ],
                [
                  '偶数半減',
                  'ON にすると、♥ と ♦ の 2・4・6・8・10・Q の 12 枚を抜いた 40 枚で遊びます（初期設定 OFF）',
                ],
              ]}
            />
            <Note>
              配る枚数が山札より多くなる組み合わせ（たとえば偶数半減 ON で 4 人に 11
              枚ずつ）では、ゲームを開始できません。
            </Note>
          </Section>

          <Section id="differences" n={13}>
            <P>
              このアプリは
              <a
                href={EXTERNAL_URLS.officialRules}
                target="_blank"
                rel="noreferrer noopener"
                className="mx-fib-1 text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                素数大富豪の公式ルール
              </a>
              をもとにしていますが、オンラインで遊びやすくするために、次の点が異なります。
            </P>
            <Ul>
              <li>
                <strong>ジョーカーは使いません。</strong>デッキはジョーカーなしの 52 枚です。
              </li>
              <li>
                <strong>1729（ラマヌジャン革命）はありません。</strong>
                1729 を出しても特別な効果は起きません。
              </li>
              <li>素数かどうかは、プレイヤーが確かめる代わりにサーバーが自動で判定します。</li>
            </Ul>
            <h3 className="m-0 text-[length:var(--fs-0)] font-bold leading-[1.618]">
              このアプリでの決まり
            </h3>
            <Ul>
              <li>
                一度に出せるのは初期設定で {DEFAULTS.maxSubmitNumCards}{' '}
                枚までです（ルールオプションで無制限にできます）。
              </li>
              <li>
                1 手番に制限時間（初期設定 {DEFAULTS.timeLimit}{' '}
                秒）があり、時間切れは自動的にパスになります。
              </li>
              <li>合成数出しの累乗は 1 段までです（底は素数、指数は 2 以上）。</li>
              <li>合成数出しで式に使ったカードは、場ではなく山札に戻ります。</li>
            </Ul>
            <Note>公式ルールの細かな点は、上のリンク先で確認してください。</Note>
          </Section>

          <Section id="how-to-play" n={14}>
            <ol className="m-0 flex list-none flex-col gap-fib-3 p-0">
              {HOW_TO_STEPS.map((step, i) => (
                <li key={step.name} className="grid grid-cols-[auto_1fr] gap-x-fib-3">
                  <span
                    aria-hidden="true"
                    className="num flex size-8 items-center justify-center rounded-[var(--r-1)] border border-line font-bold text-ink-muted"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="m-0 text-[length:var(--fs-0)] font-bold leading-[1.618]">
                      {step.name}
                    </h3>
                    <p className="m-0 leading-[1.75] text-ink-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-fib-3">
              <Link
                href="/room/new"
                className="inline-flex min-h-[44px] items-center gap-fib-2 rounded-[var(--r-2)] bg-prime px-fib-4 font-bold text-on-prime no-underline shadow-[var(--shadow-1)] transition-opacity duration-[var(--t-sm)] hover:opacity-90"
              >
                ルームを作る
                <IconArrowRight {...ICON} />
              </Link>
              <Link
                href="/labo/calc"
                className="inline-flex min-h-[44px] items-center gap-fib-2 rounded-[var(--r-2)] border border-border-strong px-fib-4 font-bold text-ink no-underline transition-colors duration-[var(--t-sm)] hover:bg-surface"
              >
                素数判定ラボで練習する
              </Link>
            </div>
          </Section>

          <Section id="faq" n={15}>
            <dl className="m-0 flex flex-col gap-fib-4">
              {FAQS.map((faq) => (
                <div
                  key={faq.question}
                  className="border-line border-t pt-fib-3 first:border-t-0 first:pt-0"
                >
                  <dt className="font-bold leading-[1.618]">
                    <span aria-hidden="true" className="num mr-fib-2 text-prime">
                      Q.
                    </span>
                    {faq.question}
                  </dt>
                  <dd className="m-0 mt-fib-1 leading-[1.75] text-ink-muted">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <footer className="flex flex-col gap-fib-2 border-line border-t pt-fib-4 text-[length:var(--fs--1)] text-ink-muted">
            <p className="m-0">
              ルールの出典：
              <a
                href={EXTERNAL_URLS.officialRules}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                素数大富豪 公式ルール
              </a>
            </p>
            <p className="m-0">
              不具合やご意見は
              <a
                href={EXTERNAL_URLS.feedback}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-fib-1 text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                フィードバックフォーム
              </a>
              からどうぞ。
            </p>
          </footer>
        </article>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Toc() {
  return (
    <nav
      aria-labelledby="toc-title"
      className="rounded-[var(--r-3)] border border-line bg-surface p-fib-4"
    >
      <h2 id="toc-title" className="m-0 mb-fib-2 text-[length:var(--fs-0)] font-bold">
        目次
      </h2>
      <ol className="m-0 grid list-none gap-x-fib-5 gap-y-fib-1 p-0 sm:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-flex min-h-[32px] items-baseline gap-fib-2 text-ink no-underline hover:text-prime"
            >
              <span className="num w-[2ch] text-right text-[length:var(--fs--1)] text-ink-muted">
                {i + 1}
              </span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Section({ id, n, children }: { id: SectionId; n: number; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)?.title ?? id
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-fib-5 flex-col gap-fib-3"
    >
      <h2
        id={`${id}-title`}
        className="m-0 flex items-baseline gap-fib-2 border-line border-b pb-fib-2 text-[length:var(--fs-2)] font-bold leading-[1.236]"
      >
        <span aria-hidden="true" className="num text-[length:var(--fs-0)] text-prime">
          §{n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="m-0 leading-[1.75]">{children}</p>
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 border-line border-l-2 pl-fib-3 text-[length:var(--fs--1)] leading-[1.75] text-ink-muted">
      {children}
    </p>
  )
}

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-fib-2 pl-fib-5 leading-[1.75] marker:text-composite">
      {children}
    </ul>
  )
}

function Ol({ children }: { children: ReactNode }) {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-fib-2 pl-fib-5 leading-[1.75] marker:font-mono marker:text-ink-muted">
      {children}
    </ol>
  )
}

/** Term / description pairs set like the waiting room's axioms. */
function Dl({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(5.5rem,auto)_1fr] overflow-hidden rounded-[var(--r-2)] border border-line bg-surface">
      {items.map(([term, desc], i) => (
        <div key={term} className={`contents ${i > 0 ? '[&>*]:border-line [&>*]:border-t' : ''}`}>
          <dt className="px-fib-3 py-fib-2 font-bold">{term}</dt>
          <dd className="m-0 px-fib-3 py-fib-2 leading-[1.75] text-ink-muted">{desc}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A playing card face, reduced to its rank. */
function CardChip({ rank }: { rank: string }) {
  return (
    <span className="num inline-flex h-[2.25em] min-w-[1.75em] items-center justify-center rounded-[var(--r-1)] border border-border-strong bg-surface px-fib-1 font-bold shadow-[var(--shadow-1)]">
      {rank}
    </span>
  )
}

/** Worked examples: cards → value, with a caption. */
function Examples({
  items,
}: {
  items: readonly (readonly [readonly string[], string, string])[]
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-fib-2 p-0">
      {items.map(([cards, value, caption]) => (
        <li
          key={caption}
          className="flex flex-wrap items-center gap-x-fib-3 gap-y-fib-1 rounded-[var(--r-2)] bg-surface px-fib-3 py-fib-2"
        >
          <span className="inline-flex gap-fib-1" aria-label={`カード ${cards.join('、')}`}>
            {cards.map((rank, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ranks can repeat; the order is fixed
              <CardChip key={`${rank}-${i}`} rank={rank} />
            ))}
          </span>
          <span aria-hidden="true" className="text-ink-muted">
            →
          </span>
          <span className="num text-[length:var(--fs-1)] font-bold">{value}</span>
          <span className="w-full text-[length:var(--fs--1)] text-ink-muted sm:ml-auto sm:w-auto">
            {caption}
          </span>
        </li>
      ))}
    </ul>
  )
}
