import type { CardId } from '@/game-card/src'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import { SubmitTray } from './SubmitTray'

const meta = {
  title: 'Board/SubmitTray',
  component: SubmitTray,
  parameters: { layout: 'padded' },
  args: {
    cardIds: ['10S', '3H'],
    fieldTop: ['AS', '3C'],
    onRemove: fn(),
    onReset: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SubmitTray>

export default meta
type Story = StoryObj<typeof meta>

/** `[10][3] = 103 ≟  枚数 2 ✓  > 場 ✓`: arithmetic only, never a primality verdict. */
export const Checks: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('≟')).toBeInTheDocument()
    const tray = canvasElement.querySelector('[data-motion]') as HTMLElement
    await expect(tray.textContent).not.toMatch(/素数|prime|∈ℙ/)
    await userEvent.click(canvas.getAllByRole('option')[0])
    await expect(args.onRemove).toHaveBeenCalledWith('10S')
  },
}

export const Failing: Story = {
  args: { cardIds: ['KS'], fieldTop: ['AS', '3C'] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-check="count"]')).toHaveAttribute(
      'data-ok',
      'false',
    )
  },
}

export const Empty: Story = {
  args: { cardIds: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'リセット' })).toBeDisabled()
  },
}

/** Exactly 57: the gold border draws, `G` pops and a shimmer sweeps the digits (#15). */
export const Grothendieck57: Story = {
  args: { cardIds: ['5S', '7H'], fieldTop: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-grothendieck="true"]')).not.toBeNull()
    await expect(within(canvasElement).getByText('G')).toBeInTheDocument()
  },
}

function Blocked() {
  const [shakeKey, setShakeKey] = useState(0)
  const [cards, setCards] = useState<CardId[]>(['4S', '7D'])
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <SubmitTray
        cardIds={cards}
        fieldTop={['KS', 'KH']}
        onRemove={(c) => setCards((cs) => cs.filter((x) => x !== c))}
        onReset={() => setCards([])}
        shakeKey={shakeKey}
        errorMessage={shakeKey > 0 ? '場より大きい数を出してください' : null}
      />
      <button
        type="button"
        className="justify-self-start rounded-[var(--r-2)] bg-prime px-[var(--sp-4)] font-semibold text-on-prime"
        style={{ minHeight: 55 }}
        onClick={() => setShakeKey((k) => k + 1)}
      >
        出す ↑
      </button>
    </div>
  )
}

/** A blocked submit: damped shake, danger border and the inline message (#18). */
export const BlockedSubmit: Story = {
  render: () => <Blocked />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '出す ↑' }))
    await expect(canvas.getByText('場より大きい数を出してください')).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-shake="1"]')).not.toBeNull()
  },
}
