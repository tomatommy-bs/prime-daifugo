import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import { MathCard, type MathCardState } from './math-card'

const meta = {
  title: 'Cards/MathCard',
  component: MathCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { card: 'JS', size: 'hand', onActivate: fn() },
  argTypes: {
    state: {
      control: 'select',
      options: ['rest', 'selected', 'disabled', 'confirmed', 'error', 'fresh'],
    },
    size: { control: 'select', options: ['hand', 'field', 'tray', 'seat', '8rem'] },
  },
} satisfies Meta<typeof MathCard>

export default meta
type Story = StoryObj<typeof meta>

export const Rest: Story = {
  play: async ({ canvasElement, args }) => {
    const card = within(canvasElement).getByRole('option', { name: 'スペードのJ, 11' })
    await userEvent.click(card)
    await expect(args.onActivate).toHaveBeenCalledTimes(1)
    card.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onActivate).toHaveBeenCalledTimes(2)
  },
}

const STATES: MathCardState[] = ['rest', 'selected', 'disabled', 'confirmed', 'error', 'fresh']

/** Every §8.1 state side by side, each with its non-colour signal. */
export const States: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'flex-start' }}>
      {STATES.map((state) => (
        <figure key={state} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)' }}>
          <MathCard {...args} state={state} showValue={true} />
          <figcaption className="num text-ink-muted" style={{ fontSize: 'var(--fs--1)' }}>
            {state}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const options = within(canvasElement).getAllByRole('option')
    await expect(options.map((o) => o.getAttribute('data-state'))).toEqual(STATES)
    await expect(options[2]).toHaveAttribute('aria-disabled', 'true')
  },
}

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-end' }}>
      {(['seat', 'tray', 'field', 'hand'] as const).map((size) => (
        <MathCard key={size} {...args} size={size} />
      ))}
      <MathCard {...args} card="Back" size="hand" onActivate={undefined} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: '山札' })).toBeInTheDocument()
  },
}

function ErrorReplay() {
  const [n, setN] = useState(0)
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'center' }}>
      <MathCard key={n} card="9D" size="hand" state={n > 0 ? 'error' : 'rest'} />
      <button
        type="button"
        onClick={() => setN((v) => v + 1)}
        style={{ minHeight: 44 }}
        className="rounded-[var(--r-2)] border border-border-strong px-[var(--sp-3)]"
      >
        error
      </button>
    </div>
  )
}

/** The error state: a damped shake and a 610 ms danger outline. */
export const ErrorShake: Story = {
  render: () => <ErrorReplay />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'error' }))
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'error')
  },
}
