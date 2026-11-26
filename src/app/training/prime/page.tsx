import { ModePage, P, modeMetadata } from '../_ui/mode-page'
import { PrimeRun } from './prime-run'

export const metadata = modeMetadata('prime')

export default function Page() {
  return (
    <ModePage
      mode="prime"
      rulesLink={{ href: '/rules#primes', label: '覚えておくと便利な素数とコツ' }}
      howTo={
        <>
          <P>
            カードを左から順に並べた数が表示されます。素数なら「素数」、そうでなければ「合成数」を選びます（キーボードでは
            ← と →）。答えると、合成数なら素因数分解と見分け方のヒントが表示されます。
          </P>
          <P>
            難易度は数をつくるカードの枚数で、やさしいは 2 枚、ふつうは 3 枚、むずかしいは 4
            枚です。10
            問の正解数とタイムを競い、ベスト記録はこのブラウザに保存されます。答えを見ている間は時計が止まります。
          </P>
        </>
      }
    >
      <PrimeRun />
    </ModePage>
  )
}
