import { renderWithProviders } from '@/test-utils'
import { describe, expect, it } from 'vitest'
import { FieldSequence, PHYLLO_MAX, sequenceText, visibleSequence } from './FieldSequence'

const seq = (c: HTMLElement) => c.querySelector('[data-field-sequence]') as HTMLElement

describe('sequence helpers', () => {
  it.each([
    [[13, 47, 1013], 3, '13 < 47 < 1013'],
    [[13, 47, 1013, 1103], 3, '… < 47 < 1013 < 1103'],
    [[2, 3, 5, 7, 11], 2, '… < 7 < 11'],
    [[13], 3, '13'],
    [[], 3, ''],
  ])('%j (max %i) → %s', (values, max, text) => {
    expect(sequenceText(values, max)).toBe(text)
  })

  it('trailing <', () => {
    expect(sequenceText([13, 47], 3, true)).toBe('13 < 47 <')
  })

  it('visibleSequence reports the collapse', () => {
    expect(visibleSequence([1, 2, 3, 4], 3)).toEqual({ shown: [2, 3, 4], collapsed: true })
    expect(visibleSequence([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], collapsed: false })
  })
})

describe('FieldSequence', () => {
  it('renders 13 < 47 < 1013', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[13, 47, 1013]} layout="line" />,
    )
    expect(seq(container)).toHaveTextContent('13 < 47 < 1013')
    expect(seq(container)).not.toHaveAttribute('data-collapsed')
  })

  it('collapses to … < past 3 values', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[2, 13, 47, 1013]} layout="line" />,
    )
    expect(seq(container)).toHaveTextContent('… < 13 < 47 < 1013')
    expect(seq(container)).toHaveAttribute('data-collapsed', 'true')
    expect(container.querySelector('[data-value="2"]')).toBeNull()
  })

  it('honours max', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[2, 13, 47, 1013]} layout="line" max={2} />,
    )
    expect(seq(container)).toHaveTextContent('… < 47 < 1013')
  })

  it('trailing < leads into the field top', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[13, 47]} layout="line" trailing={true} />,
    )
    expect(seq(container).textContent?.trim()).toBe('13 < 47 <')
  })

  it('struck: a strike per value and the 流れ chip', () => {
    const { container, getByText } = renderWithProviders(
      <FieldSequence values={[13, 47, 1013]} layout="line" struck={true} />,
    )
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(3)
    expect(seq(container)).toHaveAttribute('data-struck', 'true')
    expect(getByText('流れ')).toBeInTheDocument()
  })

  it('empty values render an empty readout', () => {
    const { container } = renderWithProviders(<FieldSequence values={[]} layout="line" />)
    expect(seq(container)).toHaveAttribute('data-empty', 'true')
    expect(seq(container)).toHaveTextContent('')
  })

  it('phyllotaxis: newest first, never smaller than --fs--1', () => {
    const values = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    const { container, getByText } = renderWithProviders(
      <FieldSequence values={values} layout="phyllotaxis" />,
    )
    expect(seq(container)).toHaveAttribute('data-layout', 'phyllotaxis')
    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-age]'))
    expect(items).toHaveLength(PHYLLO_MAX)
    expect(items[0]).toHaveAttribute('data-value', '29')
    for (const el of items) {
      expect(el.style.fontSize).toMatch(/^max\(var\(--fs--1\), calc\(var\(--fs-1\) \* [\d.]+\)\)$/)
    }
    // the sequence still reads in order for assistive tech
    expect(getByText(/場の履歴/)).toHaveTextContent('… < 5 < 7 < 11 < 13 < 17 < 19 < 23 < 29')
  })

  it('phyllotaxis can be struck too', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[13, 47, 1013, 1103]} layout="phyllotaxis" struck={true} />,
    )
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(4)
  })

  it('data-motion follows reduced motion', () => {
    const { container } = renderWithProviders(
      <FieldSequence values={[13, 47]} layout="line" struck={true} />,
      { reducedMotion: true },
    )
    expect(seq(container)).toHaveAttribute('data-motion', 'reduced')
    // information is kept: strikes and chip still render
    expect(container.querySelectorAll('[data-strike]')).toHaveLength(2)
  })
})
