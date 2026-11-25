import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { Seat } from './Seat'

const meta = {
  title: 'Board/Table/Seat',
  component: Seat,
  args: { name: 'bob', handCount: 9, hueIndex: 1, layout: 'chip' },
} satisfies Meta<typeof Seat>

export default meta
type Story = StoryObj<typeof meta>

/** An opponent chip: count only, never faces. */
export const Opponent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('9')).toBeInTheDocument()
    await expect(canvas.queryAllByRole('option')).toHaveLength(0)
  },
}

/** Every marker at once: active (`aria-current`), lead ▲, penalty `+2`. */
export const ActiveLead: Story = {
  args: { isActive: true, isLead: true, penalty: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group')).toHaveAttribute('aria-current', 'true')
    await expect(canvas.getByText('▲')).toBeInTheDocument()
  },
}

export const Passed: Story = { args: { passed: true, hueIndex: 2, name: 'carol', handCount: 3 } }

export const Observer: Story = {
  args: { observer: true, handCount: null, name: 'dave', hueIndex: 3 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('観戦')).toBeInTheDocument()
  },
}

/** The node layout used on the wide ring, with the turn timer on the active seat. */
export const NodeSelfActive: Story = {
  args: {
    layout: 'node',
    name: 'alice',
    isSelf: true,
    isActive: true,
    hueIndex: 0,
    handCount: 7,
    leftTime: 42,
    timeLimit: 60,
  },
}

/** All four seat hues (golden-angle OKLCH), light. */
export const Hues: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
      {['alice', 'bob', 'carol', 'dave'].map((name, k) => (
        <Seat
          key={name}
          name={name}
          handCount={7 - k}
          hueIndex={k}
          layout="node"
          isLead={k === 1}
        />
      ))}
    </div>
  ),
}

export const HuesDark: Story = { ...Hues, globals: { colorScheme: 'dark' } }

export const NodeSelfActiveDark: Story = { ...NodeSelfActive, globals: { colorScheme: 'dark' } }
