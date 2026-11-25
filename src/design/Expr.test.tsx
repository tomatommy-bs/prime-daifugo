import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Expr, TIMES, exprAriaLabel, typesetExpr } from './Expr'

describe('Expr', () => {
  it('typesets 2^3*3 as 2, <sup>3</sup>, ·, 3', () => {
    const { container } = renderWithProviders(<Expr tokens={['2S', '^', '3H', '*', '3C']} />)
    const math = screen.getByRole('math')
    expect(math.textContent).toBe(`23${TIMES}3`)
    const sup = container.querySelector('sup')
    expect(sup?.textContent).toBe('3')
    expect(container.querySelectorAll('[data-token="num"]')).toHaveLength(2)
    expect(container.querySelector('[data-token="times"]')?.textContent).toBe(TIMES)
  })
  it('raises exponents to the top of the flex row (flex items ignore vertical-align)', () => {
    const { container } = renderWithProviders(<Expr tokens={['2S', '^', '4H', '*', '7C']} />)
    const sup = container.querySelector<HTMLElement>('sup[data-token="exp"]')
    expect(sup?.style.alignSelf).toBe('flex-start')
    expect(sup?.style.fontSize).toBe('0.6em')
  })

  it('joins adjacent number cards', () => {
    expect(typesetExpr(['AS', '3H', '*', 'JD'])).toEqual([
      { kind: 'num', value: '13', exponent: false, index: 0 },
      { kind: 'times' },
      { kind: 'num', value: '11', exponent: false, index: 1 },
    ])
  })
  it('reads aloud in Japanese', () => {
    expect(exprAriaLabel(['2S', '^', '3H', '*', '3C'])).toBe('2 の 3 乗 掛ける 3')
    renderWithProviders(<Expr tokens={['2S', '*', '3C']} />)
    expect(screen.getByRole('math', { name: '2 掛ける 3' })).toBeInTheDocument()
  })
  it('boxes the highlighted factor', () => {
    const { container } = renderWithProviders(
      <Expr tokens={['2S', '*', '9H', '*', '3C']} highlightIndex={1} />,
    )
    const boxed = container.querySelector('[data-highlight="true"]')
    expect(boxed?.textContent).toBe('9')
  })
  it('boxes a highlighted exponent', () => {
    const { container } = renderWithProviders(
      <Expr tokens={['2S', '^', '4H']} highlightIndex={1} />,
    )
    expect(container.querySelector('sup[data-highlight="true"]')?.textContent).toBe('4')
  })
  it('shows an empty exponent slot while composing', () => {
    const { container } = renderWithProviders(<Expr tokens={['2S', '^']} />)
    expect(container.querySelector('[data-token="pow-pending"]')).not.toBeNull()
    expect(exprAriaLabel(['2S', '^', '*', '3C'])).toBe('2 の □ 乗 掛ける 3')
  })
  it('marks reduced motion', () => {
    renderWithProviders(<Expr tokens={['2S']} />, { reducedMotion: true })
    expect(screen.getByRole('math')).toHaveAttribute('data-motion', 'reduced')
  })
})
