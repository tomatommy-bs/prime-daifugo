import { ModePage, P, modeMetadata } from '../_ui/mode-page'
import { FactorRun } from './factor-run'

export const metadata = modeMetadata('factor')

export default function Page() {
  return (
    <ModePage
      mode="factor"
      rulesLink={{ href: '/rules#factor', label: '合成数出し（素因数分解）' }}
      howTo={
        <>
          <P>
            場に数が出ています。対戦と同じく、場と同じ枚数で場より大きな合成数を「出す数」に並べ、残りのカードと
            × ・ ^ で、その素因数分解の式を「式」に並べます。たとえば場が 10 のとき
            Q（12）を出すなら、式は 2 ^ 2 × 3 です。式の因数はすべて素数で、1 は使えません。
          </P>
          <P>
            ときどき、場を超える合成数出しができない問題が混ざっています。そのときは「解なし」を押すと正解です。答えたあとは、場を超えられた合成数出しが一覧で表示されます。難易度は場と手札の枚数で、やさしいは場
            1〜2 枚・手札 6 枚、ふつうは場 2〜3 枚・手札 8 枚、むずかしいは場 3〜4 枚・手札 10
            枚です。
          </P>
        </>
      }
    >
      <FactorRun />
    </ModePage>
  )
}
