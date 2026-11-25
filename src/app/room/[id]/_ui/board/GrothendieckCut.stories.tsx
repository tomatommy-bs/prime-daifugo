import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import { GrothendieckCut } from './GrothendieckCut'

const meta = {
  title: 'Board/Table/GrothendieckCut',
  component: GrothendieckCut,
  decorators: [
    (Story) => (
      <div
        style={{
          position: 'relative',
          width: 560,
          height: 280,
          border: '1px dashed var(--line)',
          borderRadius: 'var(--r-3)',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: { active: true, onDone: fn(), cards: ['5S', '7H'] },
} satisfies Meta<typeof GrothendieckCut>

export default meta
type Story = StoryObj<typeof meta>

export const Cut: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('57 — グロタンディーク素数切り')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /グロタンディーク素数切り/ }))
    await expect(args.onDone).toHaveBeenCalledTimes(1)
  },
}

export const SlashOnly: Story = { args: { cards: undefined } }

function Replay() {
  const [run, setRun] = useState(0)
  const [active, setActive] = useState(true)
  return (
    <>
      <GrothendieckCut
        key={run}
        active={active}
        onDone={() => setActive(false)}
        cards={['5S', '7H']}
      />
      {active ? null : (
        <button
          type="button"
          style={{ position: 'absolute', bottom: 8, right: 8 }}
          onClick={() => {
            setRun((r) => r + 1)
            setActive(true)
          }}
        >
          replay
        </button>
      )}
    </>
  )
}

export const ReplayLoop: Story = { render: () => <Replay /> }
export const CutDark: Story = { ...Cut, globals: { colorScheme: 'dark' } }
