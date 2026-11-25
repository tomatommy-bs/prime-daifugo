import { renderWithProviders } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import NotifyMessageContent, {
  DrawNotice,
  EndNotice,
  SystemNotice,
  logKindOf,
  submitNotices,
} from './notification-message'

const textOf = (ui: React.ReactElement) => {
  const { container } = renderWithProviders(<p>{ui}</p>)
  return container
}

describe('NotifyMessageContent', () => {
  it('keeps every component name', () => {
    expect(Object.keys(NotifyMessageContent).sort()).toEqual(
      [
        'Chat',
        'OnPass',
        'OnSubmitSuccessful',
        'OnSubmitWithGrothendieck',
        'OnSubmitNotPrime',
        'OnSubmitWithInvalidFactor',
        'OnSubmitWithPrimeFactor',
        'OnSubmitWithWrongEquation',
      ].sort(),
    )
  })

  it.each([
    [<NotifyMessageContent.Chat key="c" sender="bob" message="hi" />, ['bob', 'hi']],
    [<NotifyMessageContent.Chat key="c2" message="system" />, ['system']],
    [<NotifyMessageContent.OnPass key="p" sender="bob" />, ['bob', 'がパスしました']],
    [
      <NotifyMessageContent.OnSubmitSuccessful key="s" sender="bob" submit={['AS', '3H']} />,
      ['bob', '13', 'を出しました'],
    ],
    [
      <NotifyMessageContent.OnSubmitSuccessful
        key="sf"
        sender="bob"
        submit={['2S', '2H']}
        factor={['2S', '*', 'JH']}
      />,
      ['22', '='],
    ],
    [
      <NotifyMessageContent.OnSubmitWithGrothendieck key="g" sender="bob" submit={['5S', '7H']} />,
      ['グロタンディーク素数', '57', '切り'],
    ],
    [
      <NotifyMessageContent.OnSubmitNotPrime key="n" sender="bob" submit={['2S', '2H']} />,
      ['22', '素数ではありません'],
    ],
    [
      <NotifyMessageContent.OnSubmitWithInvalidFactor
        key="i"
        sender="bob"
        submit={['2S']}
        factor={['2S']}
      />,
      ['素因数分解として成立していません'],
    ],
    [
      <NotifyMessageContent.OnSubmitWithPrimeFactor
        key="f"
        sender="bob"
        submit={['8S']}
        factor={['2S', '*', '4H']}
      />,
      ['因数に素数以外のカードが含まれています'],
    ],
    [
      <NotifyMessageContent.OnSubmitWithWrongEquation
        key="w"
        sender="bob"
        submit={['8S']}
        factor={['3S', '*', '3H']}
      />,
      ['等式が間違っています'],
    ],
  ])('renders %#', (ui, texts) => {
    const container = textOf(ui)
    for (const t of texts) {
      expect(container.textContent).toContain(t)
    }
  })

  it('never nests block elements inside a <p>', () => {
    const container = textOf(
      <NotifyMessageContent.OnSubmitWithWrongEquation
        sender="bob"
        submit={['8S']}
        factor={['3S', '*', '3H']}
      />,
    )
    expect(container.querySelector('p div, p p')).toBeNull()
  })

  it('typesets factors with Expr', () => {
    const container = textOf(
      <NotifyMessageContent.OnSubmitSuccessful
        sender="bob"
        submit={['2S', '2H']}
        factor={['2S', '*', 'JH']}
      />,
    )
    expect(container.querySelector('[role="math"]')).not.toBeNull()
  })
})

describe('notice helpers', () => {
  it('submitNotices: success, 57 adds the cut, failures map per code', () => {
    expect(submitNotices('bob', { submit: ['AS', '3H'], factor: [] }, null)).toHaveLength(1)
    const cut = submitNotices('bob', { submit: ['5S', '7H'], factor: [] }, null)
    expect(cut).toHaveLength(2)
    expect(cut[1].color).toBe('green')
    const fail = submitNotices('bob', { submit: ['2S'], factor: [] }, 'BASE_IS_NOT_PRIME')
    expect(fail[0].color).toBe('red')
    expect(logKindOf(fail[0].message)).toBe('fail')
    expect(logKindOf(cut[0].message)).toBe('play')
  })

  it('logKindOf reads element types and data-log-kind', () => {
    expect(logKindOf(<NotifyMessageContent.OnPass sender="a" />)).toBe('pass')
    expect(logKindOf(<EndNotice winner="a" />)).toBe('end')
    expect(logKindOf(<DrawNotice sender="a" />)).toBe('system')
    expect(logKindOf(<SystemNotice>x</SystemNotice>)).toBe('system')
    expect(logKindOf(<span data-log-kind="play">x</span>)).toBe('play')
    expect(logKindOf('時間切れです')).toBe('system')
  })

  it('draw and end notices', () => {
    expect(textOf(<DrawNotice sender="bob" />).textContent).toContain('がドローしました')
    expect(textOf(<EndNotice winner="bob" />).textContent).toContain('の勝利です')
  })
})
