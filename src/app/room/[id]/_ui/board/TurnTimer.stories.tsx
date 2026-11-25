import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { useEffect, useState } from 'react'
import { TurnTimer } from './TurnTimer'

const meta = {
  title: 'Board/Table/TurnTimer',
  component: TurnTimer,
  args: { leftTime: 42, timeLimit: 60, size: 28 },
} satisfies Meta<typeof TurnTimer>

export default meta
type Story = StoryObj<typeof meta>

export const Calm: Story = {
  play: async ({ canvasElement }) => {
    const timer = within(canvasElement).getByRole('timer')
    await expect(timer).toHaveAttribute('data-urgency', 'none')
    await expect(timer).toHaveAttribute('aria-valuemax', '60')
  },
}

export const Warn: Story = { args: { leftTime: 9 } }
export const Danger: Story = { args: { leftTime: 4 } }

/** The server clock can go negative; the dial shows 0 and 時間切れ. */
export const Negative: Story = {
  args: { leftTime: -3 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('timer')).toHaveAttribute('aria-valuenow', '0')
  },
}

function Countdown({ from, size }: { from: number; size: number }) {
  const [left, setLeft] = useState(from)
  useEffect(() => {
    const id = setInterval(() => setLeft((t) => (t <= -1 ? from : t - 1)), 1000)
    return () => clearInterval(id)
  }, [from])
  return <TurnTimer leftTime={left} timeLimit={15} size={size} />
}

/** A live 15 s countdown: linear tween per tick, --danger from 10 s, pulse from 5 s. */
export const Live: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
      <Countdown from={15} size={28} />
      <Countdown from={15} size={55} />
    </div>
  ),
}

export const LiveDark: Story = { ...Live, globals: { colorScheme: 'dark' } }
export const DangerDark: Story = { ...Danger, globals: { colorScheme: 'dark' } }
