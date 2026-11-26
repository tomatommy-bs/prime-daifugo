import { ModePage, P, modeMetadata } from '../_ui/mode-page'
import { BeatRun } from './beat-run'

export const metadata = modeMetadata('beat')

export default function Page() {
  return (
    <ModePage
      mode="beat"
      rulesLink={{ href: '/rules#submit', label: '出せるカードの条件' }}
      howTo={
        <>
          <P>
            場に素数が出ています。対戦と同じく、場と同じ枚数のカードを手札から選び、場より大きな素数をつくって「出す」を押します。57（グロタンディーク素数）も、場より大きければ正解です。
          </P>
          <P>
            ときどき、どう並べても場を超えられない問題が混ざっています。そのときは「解なし」を押すと正解です。答えたあとは、その手札で出せたすべての数が表示されます。難易度は場の枚数と手札の枚数で、やさしいは場
            2 枚・手札 7 枚、ふつうは場 3 枚・手札 9 枚、むずかしいは場 4 枚・手札 11 枚です。
          </P>
        </>
      }
    >
      <BeatRun />
    </ModePage>
  )
}
