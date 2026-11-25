import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FACTOR_OMITTED_TEXT, FactorTree, factorEquation, factorTreeLayout } from './FactorTree'

describe('FactorTree', () => {
  it('splits 221 into prime leaves 13 and 17', () => {
    const { container } = renderWithProviders(<FactorTree value={221} factors={[13, 17]} />)
    const leaves = [...container.querySelectorAll('[data-node="leaf"]')].map((n) => n.textContent)
    expect(leaves).toEqual(['13', '17'])
    expect(container.querySelector('[data-node="inner"]')?.textContent).toBe('221')
    expect(screen.getByText('221 = 13 · 17')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(2)
  })
  it('chains deeper factorizations', () => {
    const layout = factorTreeLayout(1102, [2, 19, 29])
    expect(layout.nodes.map((n) => n.label)).toEqual(['1102', '2', '551', '19', '29'])
    expect(layout.edges.map((e) => e.level)).toEqual([1, 1, 2, 2])
  })
  it('renders a prime as a single leaf', () => {
    const { container } = renderWithProviders(<FactorTree value={13} factors={[13]} />)
    expect(container.querySelectorAll('[data-node="leaf"]')).toHaveLength(1)
    expect(factorEquation(13, [13])).toBe('13')
  })
  it('shows the omitted text for null', () => {
    renderWithProviders(<FactorTree value={123456789} factors={null} />)
    expect(screen.getByText(FACTOR_OMITTED_TEXT, { exact: false })).toBeInTheDocument()
    expect(FACTOR_OMITTED_TEXT).toBe('合成数（因数分解は省略）')
  })
  it('handles bigint values', () => {
    expect(factorEquation(BigInt(221), [BigInt(13), BigInt(17)])).toBe('221 = 13 · 17')
  })
  it('animates branches with full motion, static when reduced', () => {
    const full = renderWithProviders(<FactorTree value={221} factors={[13, 17]} animate={true} />, {
      reducedMotion: false,
    })
    expect(full.container.querySelector('figure')).toHaveAttribute('data-motion', 'full')
    full.unmount()
    const reduced = renderWithProviders(
      <FactorTree value={221} factors={[13, 17]} animate={true} />,
      { reducedMotion: true },
    )
    expect(reduced.container.querySelector('figure')).toHaveAttribute('data-motion', 'reduced')
  })
})
