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
            手札のカードを「出す数」に並べて合成数をつくり、残りのカードと × ・ ^
            で、その素因数分解の式を「式」に並べます。たとえば Q（12）を出すなら、式は 2 ^ 2 × 3
            です。対戦と同じく、式の因数はすべて素数で、1 は使えません。
          </P>
          <P>
            ときどき、合成数出しができない手札が混ざっています。そのときは「解なし」を押すと正解です。答えたあとは、その手札でできる合成数出しが一覧で表示されます。難易度は手札の枚数で、やさしいは
            6 枚、ふつうは 8 枚、むずかしいは 10 枚です。
          </P>
        </>
      }
    >
      <FactorRun />
    </ModePage>
  )
}
