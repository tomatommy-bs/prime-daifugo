import type { FactCardId } from '@/interface/common'
import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FactorPanel, type FactorPanelProps, factorReadout } from './FactorPanel'

const setup = (props: Partial<FactorPanelProps> = {}) => {
  const onAddOperator = vi.fn()
  const onRemove = vi.fn()
  const onClose = vi.fn()
  const utils = renderWithProviders(
    <FactorPanel
      open={true}
      target={18}
      factCards={[]}
      onAddOperator={onAddOperator}
      onRemove={onRemove}
      onClose={onClose}
      {...props}
    />,
  )
  const panel = () => screen.getByRole('region', { name: '素因数分解' })
  return { ...utils, onAddOperator, onRemove, onClose, panel }
}

const relation = (panel: HTMLElement) =>
  panel.querySelector('[data-readout] [data-relation]')?.getAttribute('data-relation')

describe('factorReadout', () => {
  it('is invalid for incomplete expressions', () => {
    expect(factorReadout([], 18)).toEqual({ valid: false })
    expect(factorReadout(['2S'], 18)).toEqual({ valid: false })
    expect(factorReadout(['2S', '*'], 18)).toEqual({ valid: false })
    expect(factorReadout(['2S', '^'], 18)).toEqual({ valid: false })
  })
  it('evaluates valid expressions against the target', () => {
    expect(factorReadout(['2S', '*', '9H'], 18)).toEqual({ valid: true, value: 18, equal: true })
    expect(factorReadout(['2S', '*', '3H', '^', '2C'], 18)).toEqual({
      valid: true,
      value: 18,
      equal: true,
    })
    expect(factorReadout(['2S', '*', '3H', '*', '3C'], 17)).toEqual({
      valid: true,
      value: 18,
      equal: false,
    })
  })
})

describe('FactorPanel', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(
      <FactorPanel
        open={false}
        target={18}
        factCards={[]}
        onAddOperator={() => {}}
        onRemove={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole('region', { name: '素因数分解' })).toBeNull()
  })

  it('typesets the expression with Expr', () => {
    const { panel } = setup({ factCards: ['2S', '^', '3H', '*', '3C'] })
    const math = within(panel()).getByRole('math')
    expect(math).toHaveAttribute('aria-label', '2 の 3 乗 掛ける 3')
    expect(math.querySelector('sup')).toHaveTextContent('3')
  })

  it('shows no value and no =/≠ while the expression is invalid', () => {
    const { panel } = setup({ factCards: ['2S', '*'] })
    expect(panel()).toHaveAttribute('data-valid', 'false')
    expect(relation(panel())).toBe('pending')
    expect(within(panel()).queryByText('≠')).toBeNull()
    expect(panel().querySelector('[data-verdict]')).toBeNull()
    expect(panel().querySelector('[data-readout] [data-tone="factor"]')).toBeNull()
  })

  it('shows = value and = target when it matches', () => {
    const { panel } = setup({ target: 18, factCards: ['2S', '*', '3H', '^', '2C'] })
    expect(panel()).toHaveAttribute('data-valid', 'true')
    expect(relation(panel())).toBe('equal')
    expect(panel().querySelector('[data-readout] [data-tone="factor"]')).toHaveAttribute(
      'data-value',
      '18',
    )
    expect(panel().querySelector('[data-verdict]')).toHaveTextContent('✓')
  })

  it('shows ≠ target when it does not match', () => {
    const { panel } = setup({ target: 17, factCards: ['2S', '*', '3H', '*', '3C'] })
    expect(relation(panel())).toBe('unequal')
    expect(within(panel()).getByText('≠')).toBeInTheDocument()
    expect(panel().querySelector('[data-verdict]')).toHaveTextContent('✗')
  })

  it('never states primality', () => {
    const { panel } = setup({ target: 18, factCards: ['2S', '*', '9H'] })
    expect(panel().textContent).not.toMatch(/素数|prime|∈ℙ|∉ℙ/)
  })

  it('operator buttons call back; 戻る closes', () => {
    const { onAddOperator, onClose } = setup({ factCards: ['2S'] })
    fireEvent.click(screen.getByRole('button', { name: '掛ける' }))
    expect(onAddOperator).toHaveBeenLastCalledWith('*')
    fireEvent.click(screen.getByRole('button', { name: '累乗' }))
    expect(onAddOperator).toHaveBeenLastCalledWith('^')
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the · and xʸ glyphs', () => {
    setup({ factCards: ['2S'] })
    expect(screen.getByRole('button', { name: '掛ける' })).toHaveTextContent('·')
    expect(screen.getByRole('button', { name: '累乗' })).toHaveTextContent('xʸ')
  })

  it('disables operators until a number is last', () => {
    const { rerender } = setup({ factCards: [] })
    expect(screen.getByRole('button', { name: '掛ける' })).toBeDisabled()
    rerender(
      <FactorPanel
        open={true}
        target={18}
        factCards={['2S', '*']}
        onAddOperator={() => {}}
        onRemove={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '累乗' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '戻る' })).toBeEnabled()
  })

  it('every control is at least 44px', () => {
    setup({ factCards: ['2S'] })
    for (const name of ['掛ける', '累乗', '戻る']) {
      const btn = screen.getByRole('button', { name })
      expect(btn.style.minWidth).toBe('44px')
      expect(btn.style.minHeight).toBe('44px')
    }
  })

  it('removes a fact card or operator by index', () => {
    const tokens: FactCardId[] = ['2S', '*', '9H']
    const { onRemove, panel } = setup({ factCards: tokens })
    const list = within(panel()).getByRole('listbox', { name: '因数' })
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(3)
    fireEvent.click(options[2])
    expect(onRemove).toHaveBeenLastCalledWith(2)
    fireEvent.click(options[1])
    expect(onRemove).toHaveBeenLastCalledWith(1)
  })

  it('writes data-motion (full / reduced)', () => {
    const { panel, unmount } = setup()
    expect(panel()).toHaveAttribute('data-motion', 'full')
    unmount()
    renderWithProviders(
      <FactorPanel
        open={true}
        target={18}
        factCards={['2S', '*', '9H']}
        onAddOperator={() => {}}
        onRemove={() => {}}
        onClose={() => {}}
      />,
      { reducedMotion: true },
    )
    expect(screen.getByRole('region', { name: '素因数分解' })).toHaveAttribute(
      'data-motion',
      'reduced',
    )
  })
})

describe('FactorPanel keyboard model (same as the hand and tray)', () => {
  const factors: FactCardId[] = ['JH', '2S', '^', '4C', '*', '7D']
  const options = () => within(screen.getByRole('listbox', { name: '因数' })).getAllByRole('option')

  it('one tab stop, moved by ←/→/Home/End across cards and operator tokens', () => {
    setup({ factCards: factors })
    const tabIndexes = () => options().map((o) => o.getAttribute('tabindex'))
    expect(tabIndexes()).toEqual(['0', '-1', '-1', '-1', '-1', '-1'])
    options()[0].focus()
    fireEvent.keyDown(options()[0], { key: 'ArrowRight' })
    expect(options()[1]).toHaveFocus()
    fireEvent.keyDown(options()[1], { key: 'End' })
    expect(options()[5]).toHaveFocus()
    expect(tabIndexes()[5]).toBe('0')
    fireEvent.keyDown(options()[5], { key: 'Home' })
    expect(options()[0]).toHaveFocus()
  })

  it('keeps focus in the list after a factor is removed', () => {
    const { onRemove, rerender } = setup({ factCards: factors })
    const op = options()[2]
    op.focus()
    fireEvent.click(op)
    expect(onRemove).toHaveBeenCalledWith(2)
    rerender(
      <FactorPanel
        open={true}
        target={18}
        factCards={['JH', '2S', '4C', '*', '7D']}
        onAddOperator={vi.fn()}
        onRemove={onRemove}
        onClose={vi.fn()}
      />,
    )
    expect(options()[2]).toHaveFocus()
  })

  it('the empty listbox is not a tab stop', () => {
    setup({ factCards: [] })
    expect(screen.getByRole('listbox', { name: '因数' })).toHaveAttribute('tabindex', '-1')
  })
})
