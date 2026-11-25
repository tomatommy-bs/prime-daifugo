import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { useEffect, useState } from 'react'
import { Expr } from './Expr'
import { FactorTree } from './FactorTree'
import { ModRing } from './ModRing'
import { NumberGlyph } from './NumberGlyph'
import { SieveGrid } from './SieveGrid'
import { UlamField } from './UlamField'
import * as Icons from './icons'
import { factorize } from './math/factorize'

const meta: Meta = {
  title: 'Design/Primitives',
}
export default meta

type Story = StoryObj

function RollingCounter() {
  const values = [13, 47, 1013, 1103, 57]
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % values.length), 1200)
    return () => clearInterval(id)
  }, [])
  return <NumberGlyph value={values[i]} size={4} tone={values[i] === 57 ? 'gold' : 'ink'} />
}

export const NumberGlyphs: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <RollingCounter />
      <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'baseline' }}>
        <NumberGlyph value={1013} size={3} tone="prime" />
        <NumberGlyph value={221} size={3} tone="muted" />
        <NumberGlyph value={57} size={3} tone="gold" />
        <NumberGlyph value={5} size={3} tone="danger" />
        <NumberGlyph value={19} size={3} tone="factor" />
        <NumberGlyph value={null} size={3} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('—')).toBeInTheDocument()
    await expect(canvas.getByText('1013')).toBeInTheDocument()
  },
}

export const Expressions: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--sp-3)', fontSize: 'var(--fs-3)' }}>
      <Expr tokens={['2S', '^', '3H', '*', '3C']} />
      <Expr tokens={['2S', '*', '9H', '*', '3C']} highlightIndex={1} />
      <Expr tokens={['AS', '3H', '*', 'JD']} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('math', { name: '2 の 3 乗 掛ける 3' })).toBeInTheDocument()
  },
}

export const Sieve: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <SieveGrid n={100} cols={10} animate={true} size={20} />
      <SieveGrid n={100} cols={50} primeOpacity={0.25} size={12} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-cell="prime"]').length).toBe(50)
  },
}

export const Ulam: Story = {
  render: () => <UlamField side={21} cell={10} reveal={true} />,
}

export const ModRings: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
      <ModRing n={4} filled={2} />
      <ModRing n={12} spin={true} label="接続中…" size={64} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: '接続中…' })).toBeInTheDocument()
  },
}

export const FactorTrees: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'flex-start' }}>
      <FactorTree value={221} factors={factorize(221)} animate={true} />
      <FactorTree value={1102} factors={factorize(1102)} animate={true} />
      <FactorTree value={123456789} factors={null} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('221 = 13 · 17')).toBeInTheDocument()
  },
}

export const Glyphs: Story = {
  render: () => {
    const entries = Object.entries(Icons).filter(
      ([name, C]) => name.startsWith('Icon') && typeof C === 'function',
    ) as [string, (p: Icons.GlyphProps) => JSX.Element][]
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 88px)',
          gap: 'var(--sp-3)',
          fontSize: 32,
        }}
      >
        {entries.map(([name, C]) => (
          <div key={name} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
            <C />
            <span style={{ fontSize: 'var(--fs--1)' }}>{name}</span>
          </div>
        ))}
      </div>
    )
  },
}
