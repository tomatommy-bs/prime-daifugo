import { DEFAULT_RULE, makeSessionPresence, renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLASH_HOLD_MS, WaitingRoom, waitingSeatAngle } from './waiting-room'

const PORTRAIT = '(orientation: portrait) and (max-width: 600px)'

const row = (container: HTMLElement, key: string) => {
  const el = container.querySelector<HTMLElement>(`[data-rule="${key}"]`)
  if (!el) {
    throw new Error(`rule row ${key} not found`)
  }
  return el
}

const startButton = () => screen.getByRole('button', { name: /ゲーム開始/ })

describe('waitingSeatAngle', () => {
  it('puts residue 0 at the top and spaces at least 4 residues clockwise', () => {
    expect(waitingSeatAngle(0, 2)).toBeCloseTo(-Math.PI / 2)
    expect(waitingSeatAngle(1, 2)).toBeCloseTo(0)
    expect(waitingSeatAngle(2, 3)).toBeCloseTo(Math.PI / 2)
    expect(waitingSeatAngle(1, 6)).toBeCloseTo(-Math.PI / 2 + Math.PI / 3)
  })
})

describe('WaitingRoom', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('disables ゲーム開始 with fewer than 2 ready players', () => {
    const presence = makeSessionPresence([
      { name: 'alice', status: 'ready' },
      { name: 'bob', status: 'not-ready' },
    ])
    renderWithProviders(<WaitingRoom rule={DEFAULT_RULE} presence={presence} />)
    expect(startButton()).toBeDisabled()
    expect(screen.getByText('あと 1 人の準備で開始')).toBeInTheDocument()
    const progress = screen.getByRole('progressbar', { name: '準備完了' }) as HTMLProgressElement
    expect(progress.value).toBe(1)
    expect(progress.max).toBe(2)
  })

  it('explains that two players are needed when alone', () => {
    renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={makeSessionPresence([{ name: 'alice' }])} />,
    )
    expect(startButton()).toBeDisabled()
    expect(screen.getByText('2人以上で開始')).toBeInTheDocument()
  })

  it('enables ゲーム開始 with 2 ready players and passes the rule', () => {
    const onGameStart = vi.fn()
    const presence = makeSessionPresence(['alice', 'bob'])
    renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={presence} onGameStart={onGameStart} />,
    )
    expect(startButton()).toBeEnabled()
    fireEvent.click(startButton())
    expect(onGameStart).toHaveBeenCalledWith(DEFAULT_RULE)
  })

  it.each([
    ['timeLimit', '15', { timeLimit: 15 }],
    ['timeLimit', '300', { timeLimit: 300 }],
    ['initNumCards', '4', { initNumCards: 4 }],
    ['initNumCards', '8', { initNumCards: 8 }],
    ['maxSubmitNumCards', '∞', { maxSubmitNumCards: 52 }],
  ] as const)('%s option %s calls onChangeRule with %o', (key, label, expected) => {
    const onChangeRule = vi.fn()
    const { container } = renderWithProviders(
      <WaitingRoom
        rule={DEFAULT_RULE}
        presence={makeSessionPresence(['alice'])}
        onChangeRule={onChangeRule}
      />,
    )
    fireEvent.click(within(row(container, key)).getByRole('radio', { name: label }))
    expect(onChangeRule).toHaveBeenCalledWith(expected)
  })

  it('maps the remaining options back to the original values', () => {
    const onChangeRule = vi.fn()
    const rule = { ...DEFAULT_RULE, initNumCards: 4, maxSubmitNumCards: 52, timeLimit: 15 }
    const { container } = renderWithProviders(
      <WaitingRoom
        rule={rule}
        presence={makeSessionPresence(['alice'])}
        onChangeRule={onChangeRule}
      />,
    )
    fireEvent.click(within(row(container, 'timeLimit')).getByRole('radio', { name: '60' }))
    expect(onChangeRule).toHaveBeenLastCalledWith({ timeLimit: 60 })
    fireEvent.click(within(row(container, 'initNumCards')).getByRole('radio', { name: '11' }))
    expect(onChangeRule).toHaveBeenLastCalledWith({ initNumCards: 11 })
    fireEvent.click(within(row(container, 'maxSubmitNumCards')).getByRole('radio', { name: '4' }))
    expect(onChangeRule).toHaveBeenLastCalledWith({ maxSubmitNumCards: 4 })
    fireEvent.click(within(row(container, 'halfEvenNumbers')).getByRole('radio', { name: 'ON' }))
    expect(onChangeRule).toHaveBeenLastCalledWith({ halfEvenNumbers: true })
  })

  it('maps halfEvenNumbers OFF to false', () => {
    const onChangeRule = vi.fn()
    const { container } = renderWithProviders(
      <WaitingRoom
        rule={{ ...DEFAULT_RULE, halfEvenNumbers: true }}
        presence={makeSessionPresence(['alice'])}
        onChangeRule={onChangeRule}
      />,
    )
    fireEvent.click(within(row(container, 'halfEvenNumbers')).getByRole('radio', { name: 'OFF' }))
    expect(onChangeRule).toHaveBeenCalledWith({ halfEvenNumbers: false })
  })

  it('reflects the current rule in each control', () => {
    const { container } = renderWithProviders(
      <WaitingRoom
        rule={{ initNumCards: 8, maxSubmitNumCards: 52, timeLimit: 300, halfEvenNumbers: true }}
        presence={makeSessionPresence(['alice'])}
      />,
    )
    expect(within(row(container, 'timeLimit')).getByRole('radio', { name: '300' })).toBeChecked()
    expect(within(row(container, 'initNumCards')).getByRole('radio', { name: '8' })).toBeChecked()
    expect(
      within(row(container, 'maxSubmitNumCards')).getByRole('radio', { name: '∞' }),
    ).toBeChecked()
    expect(
      within(row(container, 'halfEvenNumbers')).getByRole('radio', { name: 'ON' }),
    ).toBeChecked()
  })

  it('writes the rules as axioms', () => {
    const { container } = renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={makeSessionPresence(['alice'])} />,
    )
    expect(screen.getByRole('heading', { name: /公理/ })).toBeInTheDocument()
    expect(row(container, 'timeLimit')).toHaveTextContent('t ∈')
    expect(row(container, 'initNumCards')).toHaveTextContent('|H0| ∈')
    expect(row(container, 'maxSubmitNumCards')).toHaveTextContent('kmax ∈')
  })

  it('calls onSetReady from 準備OK when not ready', () => {
    const onSetReady = vi.fn()
    const presence = makeSessionPresence([{ name: 'alice', status: 'not-ready' }])
    renderWithProviders(
      <WaitingRoom
        rule={DEFAULT_RULE}
        presence={presence}
        myPresence={presence[0]}
        onSetReady={onSetReady}
      />,
    )
    expect(screen.queryByRole('button', { name: /取消/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /準備OK/ }))
    expect(onSetReady).toHaveBeenCalledTimes(1)
  })

  it('calls onUnsetReady from 取消 when ready', () => {
    const onUnsetReady = vi.fn()
    const presence = makeSessionPresence([{ name: 'alice', status: 'ready' }])
    renderWithProviders(
      <WaitingRoom
        rule={DEFAULT_RULE}
        presence={presence}
        myPresence={presence[0]}
        onUnsetReady={onUnsetReady}
      />,
    )
    expect(screen.queryByRole('button', { name: /準備OK/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    expect(onUnsetReady).toHaveBeenCalledTimes(1)
  })

  it('places seats on the ring with ready, idle, self and empty residues', () => {
    const presence = makeSessionPresence([
      { id: 'a', name: 'alice', status: 'ready' },
      { id: 'b', name: 'bob', status: 'not-ready' },
      { id: 'c', name: 'carol', status: 'ready' },
    ])
    const { container } = renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={presence} myPresence={presence[1]} />,
    )
    const seats = within(screen.getByRole('list', { name: /座席/ })).getAllByRole('listitem')
    expect(seats).toHaveLength(4)
    expect(seats[0]).toHaveAccessibleName('⓪ alice 準備OK')
    expect(seats[1]).toHaveAccessibleName('① bob（あなた） 準備中')
    expect(seats[3]).toHaveAccessibleName('③ 空席')
    expect(seats[0]).toHaveAttribute('data-ready', 'true')
    expect(seats[1]).toHaveAttribute('data-ready', 'false')
    expect(seats[1]).toHaveAttribute('data-self', 'true')
    expect(seats[1].querySelector('[data-halo]')).toBeInTheDocument()
    expect(seats[0].querySelector('[data-halo]')).not.toBeInTheDocument()
    expect(seats[0].querySelector('[data-glyph="ready"]')).toBeInTheDocument()
    expect(seats[1].querySelector('[data-glyph="idle"]')).toBeInTheDocument()
    expect(seats[3]).toHaveAttribute('data-seat', 'empty')
    // ⓪ at the top centre, ① on the right
    expect(seats[0].style.left).toBe('50%')
    expect(seats[0].style.top).toBe('14%')
    expect(seats[1].style.left).toBe('86%')
    // seat hues follow the residue index
    expect(seats[2].querySelector('[data-hue]')).toHaveAttribute('data-hue', '2')
    expect(container.textContent).toContain('ℤ/4ℤ')
  })

  it('shows a disconnected member as ◌ (再接続中) and keeps their seat', () => {
    const presence = makeSessionPresence([
      { id: 'a', name: 'alice' },
      { id: 'b', name: 'bob', connected: false },
    ])
    renderWithProviders(<WaitingRoom rule={DEFAULT_RULE} presence={presence} />)
    const seats = within(screen.getByRole('list', { name: /座席/ })).getAllByRole('listitem')
    expect(seats[1]).toHaveAccessibleName('① bob 準備OK（再接続中）')
    expect(seats[1]).toHaveAttribute('data-connected', 'false')
    expect(seats[1]).toHaveTextContent('◌')
    expect(seats[1].querySelector('circle[stroke-dasharray]')).toBeInTheDocument()
    expect(seats[0]).not.toHaveAttribute('data-connected')
    expect(seats[0]).not.toHaveTextContent('◌')
  })

  it('does not count a ready but disconnected member toward the start gate', () => {
    const presence = makeSessionPresence([{ name: 'alice' }, { name: 'bob', connected: false }])
    renderWithProviders(<WaitingRoom rule={DEFAULT_RULE} presence={presence} />)
    expect(startButton()).toBeDisabled()
    expect(screen.getByText('あと 1 人の準備で開始')).toBeInTheDocument()
  })

  it('grows the ring beyond 4 players', () => {
    renderWithProviders(
      <WaitingRoom
        rule={DEFAULT_RULE}
        presence={makeSessionPresence(['a1', 'b2', 'c3', 'd4', 'e5'])}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('list', { name: '座席（ℤ/5ℤ）' })).toBeInTheDocument()
  })

  it('highlights a changed rule row with a diff chip', () => {
    vi.useFakeTimers()
    const presence = makeSessionPresence(['alice'])
    const { container, rerender } = renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={presence} />,
    )
    expect(row(container, 'timeLimit')).toHaveAttribute('data-flash', 'false')
    rerender(<WaitingRoom rule={{ ...DEFAULT_RULE, timeLimit: 15 }} presence={presence} />)
    expect(row(container, 'timeLimit')).toHaveAttribute('data-flash', 'true')
    expect(row(container, 'initNumCards')).toHaveAttribute('data-flash', 'false')
    expect(within(row(container, 'timeLimit')).getByText('60 s → 15 s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(FLASH_HOLD_MS + 10)
    })
    expect(row(container, 'timeLimit')).toHaveAttribute('data-flash', 'false')
  })

  it('stacks the panes in portrait', () => {
    const { container } = renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={makeSessionPresence(['alice'])} />,
      { media: { [PORTRAIT]: true } },
    )
    const root = container.querySelector<HTMLElement>('[data-layout]')
    expect(root).toHaveAttribute('data-layout', 'portrait')
    expect(root?.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
  })

  it('carries data-motion for reduced motion', () => {
    const { container } = renderWithProviders(
      <WaitingRoom rule={DEFAULT_RULE} presence={makeSessionPresence(['alice'])} />,
      { reducedMotion: true },
    )
    expect(container.querySelector('[data-layout]')).toHaveAttribute('data-motion', 'reduced')
  })
})
