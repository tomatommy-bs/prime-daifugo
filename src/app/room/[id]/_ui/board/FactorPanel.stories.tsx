import { type CardId, isCardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import { FactorPanel } from './FactorPanel'

const meta = {
  title: 'Board/FactorPanel',
  component: FactorPanel,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    target: 1102,
    factCards: ['2S', '*', 'AH', '9C', '*', '2D', '9H'],
    onAddOperator: fn(),
    onRemove: fn(),
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 760 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FactorPanel>

export default meta
type Story = StoryObj<typeof meta>

/** `1102 = 2 · 19 · 29 = 1102 = 1102 ✓` */
export const Equal: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-relation="equal"]')).not.toBeNull()
  },
}

/** `= 18 ≠ 17`: arithmetic help, not a primality verdict. */
export const NotEqual: Story = {
  args: { target: 17, factCards: ['2S', '*', '3H', '^', '2C'] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('≠')).toBeInTheDocument()
  },
}

export const Incomplete: Story = {
  args: { target: 221, factCards: ['KS', '*'] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.querySelector('[data-relation="pending"]')).not.toBeNull()
    await expect(canvas.getByRole('button', { name: '掛ける' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: '戻る' }))
    await expect(args.onClose).toHaveBeenCalled()
  },
}

const PALETTE: CardId[] = ['2S', '3H', '9C', 'AD', 'KS']

function Interactive() {
  const [tokens, setTokens] = useState<FactCardId[]>([])
  const used = new Set(tokens.filter(isCardId))
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <FactorPanel
        open={true}
        target={18}
        factCards={tokens}
        onAddOperator={(op) => setTokens((t) => [...t, op])}
        onRemove={(i) => setTokens((t) => t.filter((_, j) => j !== i))}
        onClose={() => setTokens([])}
      />
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        {PALETTE.filter((c) => !used.has(c)).map((c) => (
          <button
            key={c}
            type="button"
            className="num rounded-[var(--r-2)] border border-border-strong px-[var(--sp-3)]"
            style={{ minHeight: 44 }}
            onClick={() => setTokens((t) => [...t, c])}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Build `2 · 3⁹` by hand: the exponent hops into the superscript (#17), and `≠ 18` shows. */
export const Build: Story = {
  render: () => <Interactive />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '2S' }))
    await userEvent.click(canvas.getByRole('button', { name: '掛ける' }))
    await userEvent.click(canvas.getByRole('button', { name: '3H' }))
    await userEvent.click(canvas.getByRole('button', { name: '累乗' }))
    await userEvent.click(canvas.getByRole('button', { name: '9C' }))
    // 2 · 3^9 = 39366 ≠ 18
    await expect(canvasElement.querySelector('[data-relation="unequal"]')).not.toBeNull()
  },
}
