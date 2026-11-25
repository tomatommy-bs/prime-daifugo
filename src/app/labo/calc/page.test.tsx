import { REDUCED_MOTION_QUERY, mockMatchMedia, renderWithProviders } from '@/test-utils'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Page from './page'

const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.documentElement, { key, ...init })

const readout = () => screen.getByRole('region', { name: '読み取り' })
const VALUE_LABEL = /^n = |^n は未入力$/
const CLEAR = /クリア/
const value = () => within(readout()).getAllByText(VALUE_LABEL)[0]?.textContent
const verdict = () => readout().querySelector('[data-verdict]') as HTMLElement

describe('/labo/calc', () => {
  it('shows n = — and no verdict for an empty selection', () => {
    renderWithProviders(<Page />)
    const glyph = readout().querySelector('[data-empty="true"]')
    expect(glyph).not.toBeNull()
    expect(glyph?.textContent).toContain('—')
    expect(verdict()).toHaveAttribute('data-verdict', 'empty')
    expect(verdict().textContent).toBe('')
    expect(screen.queryByText('素数')).toBeNull()
    expect(screen.queryByText('合成数')).toBeNull()
  })

  it('maps hotkeys 1–9, 0 = 10 and j/q/k onto the clubs', () => {
    renderWithProviders(<Page />)
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'j', 'q', 'k']) {
      press(key)
    }
    expect(value()).toBe('n = 12345678910111213')
    expect(within(readout()).getByText('k = 13')).toBeInTheDocument()
  })

  it('Backspace removes the last card and Esc clears everything', () => {
    renderWithProviders(<Page />)
    press('1')
    press('0')
    press('1')
    press('3')
    expect(value()).toBe('n = 11013')
    press('Backspace')
    expect(value()).toBe('n = 1101')
    press('Escape')
    expect(readout().querySelector('[data-empty="true"]')).not.toBeNull()
    expect(verdict()).toHaveAttribute('data-verdict', 'empty')
  })

  it('mod+Backspace clears the selection', () => {
    renderWithProviders(<Page />)
    press('7')
    press('3')
    press('Backspace', { ctrlKey: true })
    expect(readout().querySelector('[data-empty="true"]')).not.toBeNull()
  })

  it('marks a prime as n ∈ ℙ ■ 素数', () => {
    renderWithProviders(<Page />)
    press('0')
    press('k') // 1013
    expect(value()).toBe('n = 1013')
    expect(verdict()).toHaveAttribute('data-verdict', 'prime')
    expect(verdict().textContent).toContain('∈ ℙ')
    expect(within(verdict()).getByText('素数')).toBeInTheDocument()
  })

  it('typesets a composite as n = p · q ✗ 合成数 with a real dot operator', async () => {
    renderWithProviders(<Page />)
    press('0')
    press('j') // 1011 = 3 · 337
    expect(verdict()).toHaveAttribute('data-verdict', 'composite')
    // the previous line (10 = 2 · 5) leaves through AnimatePresence
    await waitFor(() => expect(screen.getAllByTestId('factorization')).toHaveLength(1))
    const factorization = screen.getByTestId('factorization')
    expect(factorization.textContent).toBe('n = 3 ⋅ 337')
    expect(factorization).toHaveAttribute('role', 'math')
    expect(factorization).toHaveAttribute('aria-label', 'n = 3 掛ける 337')
    expect(within(verdict()).getByText('合成数')).toBeInTheDocument()
  })

  it('writes repeated factors as exponents', () => {
    renderWithProviders(<Page />)
    press('7')
    press('2') // 72 = 2³ · 3²
    const factorization = screen.getByTestId('factorization')
    const sups = factorization.querySelectorAll('sup')
    expect(Array.from(sups).map((s) => s.textContent)).toEqual(['3', '2'])
    expect(factorization).toHaveAttribute('aria-label', 'n = 2 の 3 乗 掛ける 3 の 2 乗')
  })

  it('treats 1 as a unit, neither prime nor composite', () => {
    renderWithProviders(<Page />)
    press('1')
    expect(verdict()).toHaveAttribute('data-verdict', 'unit')
    expect(verdict().textContent).toContain('∉ ℙ')
  })

  it('keypad buttons add cards and the selected cards remove themselves on click', () => {
    renderWithProviders(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'クラブの5を追加' }))
    fireEvent.click(screen.getByRole('button', { name: 'クラブのJを追加' }))
    expect(value()).toBe('n = 511')
    expect(screen.getByRole('button', { name: 'クラブのJを追加' })).toHaveAttribute(
      'aria-keyshortcuts',
      'j',
    )
    fireEvent.click(screen.getByRole('button', { name: '1枚戻す' }))
    expect(value()).toBe('n = 5')
    fireEvent.click(screen.getByRole('button', { name: CLEAR }))
    expect(readout().querySelector('[data-empty="true"]')).not.toBeNull()
  })

  it('keeps the MAX_SAFE_INTEGER alert', () => {
    renderWithProviders(<Page />)
    for (const key of '12345678912345678'.split('')) {
      press(key)
    }
    expect(screen.getByRole('alert')).toHaveTextContent(Number.MAX_SAFE_INTEGER.toLocaleString())
  })

  it('renders the 13 keypad keys with Kbd hints', () => {
    renderWithProviders(<Page />)
    const keypad = screen.getByRole('region', { name: 'キーパッド（♣）' })
    const keys = within(keypad).getAllByRole('button')
    expect(keys).toHaveLength(13)
    expect(keys.map((k) => k.getAttribute('aria-keyshortcuts'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      'j',
      'q',
      'k',
    ])
  })

  it('reports reduced motion through data-motion', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    const { container } = renderWithProviders(<Page />)
    expect(container.querySelector('[data-motion]')).toHaveAttribute('data-motion', 'reduced')
    press('3')
    // no key pulse ring under reduced motion
    expect(container.querySelector('.ring-mod')).toBeNull()
  })
})
