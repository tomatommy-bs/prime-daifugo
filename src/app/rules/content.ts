/**
 * Copy for /rules that is also published as structured data (FAQPage, HowTo), kept in one
 * place so the visible text and the JSON-LD never drift apart. The rules described here are
 * the ones this app's engine implements (`src/game`, docs/realtime/rebuild-spec.md §1.1, §14).
 */
import type { Faq, HowToStep } from '@/lib/structured-data'
import { ALLOWED_RULES, DEFAULT_RULE } from '@/shared/rule-options'
import {
  LARGEST_TWO_CARD_PRIME,
  LAST_CARD_RANKS,
  ONE_CARD_PRIMES,
  TWO_CARD_PRIMES,
  rankWithValue,
} from './primes'

/** The h1 and the breadcrumb's page name. */
export const RULES_TITLE = '素数大富豪のルールと遊び方'
/** The document title (no site-name suffix: it already starts with 素数大富豪). */
export const RULES_DOC_TITLE = `${RULES_TITLE}｜無料でオンライン対戦`
export const RULES_DESCRIPTION =
  '素数大富豪のルールをやさしく解説。カードで数をつくる方法、出せる素数の条件、合成数出し（素因数分解）、ペナルティ、場の流れ、57（グロタンディーク素数）切り、制限時間まで、オンライン版の遊び方とよくある質問をまとめました。'

export const RULES_CRUMBS = [
  { name: 'ホーム', path: '/' },
  { name: 'ルール', path: '/rules' },
] as const

/** Table of contents: section ids double as URL fragments. */
export const SECTIONS = [
  { id: 'overview', title: 'ゲームの概要' },
  { id: 'cards', title: 'カードと数のつくり方' },
  { id: 'setup', title: 'ゲームの準備' },
  { id: 'turn', title: '手番でできること' },
  { id: 'submit', title: '出せるカードの条件' },
  { id: 'factor', title: '合成数出し（素因数分解）' },
  { id: 'penalty', title: 'ペナルティ' },
  { id: 'flow', title: '場の流れ' },
  { id: 'grothendieck', title: '57 切り（グロタンディーク素数切り）' },
  { id: 'end', title: '勝敗' },
  { id: 'time', title: '制限時間と通信切れ' },
  { id: 'options', title: 'ルールオプション' },
  { id: 'primes', title: '覚えておくと便利な素数とコツ' },
  { id: 'differences', title: '公式ルールとの違い・このアプリでの決まり' },
  { id: 'how-to-play', title: 'オンラインでの遊び方' },
  { id: 'faq', title: 'よくある質問' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

const seconds = ALLOWED_RULES.timeLimit.join('・')
const hands = ALLOWED_RULES.initNumCards.join('・')

export const HOW_TO_STEPS: readonly HowToStep[] = [
  {
    name: 'ルームを作る',
    text: 'トップページの「ルーム作成」を押すと、新しいルームができます。ルーム番号はいつも素数です。',
    path: '/',
  },
  {
    name: '名前を入力する',
    text: '初めてのときは、2〜10文字のプレイヤー名を入力します。アカウント登録は必要ありません。',
  },
  {
    name: '友だちを招待する',
    text: 'ルームの URL を送るか、画面の QR コードを読み取ってもらいます。同じルームに入れば準備完了です。',
  },
  {
    name: 'ルールを決めて準備 OK を押す',
    text: `制限時間（${seconds} 秒）、初期手札（${hands} 枚）などを選び、参加する人が「準備OK」を押します。`,
  },
  {
    name: 'ゲームを開始する',
    text: '2人以上が準備 OK になったら、誰でも「ゲーム開始」を押せます。座席の順番は配るたびにランダムに決まります。',
  },
]

const largest = LARGEST_TWO_CARD_PRIME

/** Strategy tips, shown in the 'primes' section and summarised in the FAQ. */
export const PRIME_TIPS = {
  oneCard: `1 枚で出せる素数は ${ONE_CARD_PRIMES.map(rankWithValue).join('・')} の ${ONE_CARD_PRIMES.length} つです。K は 1 枚で出せる一番大きな素数です。`,
  twoCard: `2 枚でつくれる素数は ${TWO_CARD_PRIMES.length} 個あり、一番大きいのは ${largest.cards.join(' と ')} を並べた ${largest.value} です。`,
  lastCard: `2 枚以上並べるときは、最後のカードを ${LAST_CARD_RANKS.join('・')} のどれかにします。ほかのカードで終わると、2 か 5 で割り切れてしまいます。`,
  digitSum:
    '各桁の数字を足した和が 3 の倍数なら、その数は 3 で割り切れるので素数ではありません（例：5・7 の 57 は 5 + 7 = 12）。',
  shed: '合成数出しが成功すると、式に使ったカードも手札から減ります。手札が多いときに一気に減らすチャンスです。',
  grothendieck:
    '57 を出すとすぐに場が流れ、自分から出し直せます。場が空のときや、場が 57 より小さい 2 枚のときに使えます。',
} as const

export const FAQS: readonly Faq[] = [
  {
    question: '素数大富豪とはどんなゲームですか？',
    answer:
      'トランプのカードを並べて数をつくり、素数だけを場に出していくカードゲームです。前の人と同じ枚数で、より大きな素数を出し、最初に手札をなくした人が勝ちです。大富豪（大貧民）のように、場の数を上回る手を出し合います。',
  },
  {
    question: '無料で遊べますか？登録は必要ですか？',
    answer:
      '無料で遊べます。アカウント登録やアプリのインストールは不要で、ブラウザでプレイヤー名を入力するだけで始められます。',
  },
  {
    question: '何人で遊べますか？',
    answer:
      '1ゲームは2〜4人です。人数が足りないときは、待合室で CPU（よわい・ふつう・つよい）を最大3人まで追加できます。5人目以降も観戦者として最大8人まで同じルームに入れて（ルーム全体で12人まで）、次のラウンドから参加できます。',
  },
  {
    question: 'ひとりで練習できますか？',
    answer:
      'ルームを作って CPU を追加すれば、ひとりでも対戦できます。CPU は「よわい」「ふつう」「つよい」の3段階です。ほかに「トレーニング」で、素数判定・場より大きな素数づくり・合成数出しの3モードを10問のタイムアタックで練習できます。「素数判定ラボ」では、カードを並べた数（約16桁まで）が素数かどうかや素因数分解を確かめられます。ランダムマッチは準備中です。',
  },
  {
    question: '覚えておくと便利な素数はありますか？',
    answer: `${PRIME_TIPS.oneCard}${PRIME_TIPS.twoCard}まずはこの 2 つを覚えると、出せる手がすぐに見つかります。`,
  },
  {
    question: '勝つためのコツはありますか？',
    answer: `${PRIME_TIPS.lastCard}${PRIME_TIPS.shed}${PRIME_TIPS.grothendieck}`,
  },
  {
    question: '57 はなぜ出せるのですか？',
    answer:
      '57 は 3 × 19 で素数ではありませんが、数学者グロタンディークが素数の例として挙げたという逸話から「グロタンディーク素数」と呼ばれ、素数大富豪では特別に出せます。57 を出すと場が流れ、出した人がもう一度好きなカードから出せます。',
  },
  {
    question: 'ジョーカーや 1729（ラマヌジャン革命）は使えますか？',
    answer:
      'このアプリでは使えません。デッキはジョーカーなしの52枚で、1729 による革命も扱っていません。公式ルールにあるこれらの要素は、いまのところ対象外です。',
  },
  {
    question: '途中で通信が切れたらどうなりますか？',
    answer:
      'ゲーム中は120秒以内に戻れば、同じ席と手札のまま続けられます。切れている間に自分の手番が来ると、その手番は最長20秒で自動的にパスになります。120秒を過ぎると棄権となり、手札は山札に戻ります。',
  },
  {
    question: 'スマートフォンでも遊べますか？',
    answer:
      'はい。iPhone や Android のブラウザで遊べます。横向きにすると手札と場を広く表示できるのでおすすめです。',
  },
  {
    question: '大きな数の素数判定は正確ですか？',
    answer:
      '数は桁数の制限なく正確に扱います。素数判定は 3.3 × 10²⁴ 未満なら確定的なミラー–ラビン法、それより大きな数は反例が知られていない BPSW 法で行います。',
  },
]

export const DEFAULTS = DEFAULT_RULE
