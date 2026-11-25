import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { ActionBar } from './ActionBar'

const meta: Meta<typeof ActionBar> = {
  title: 'Board/ActionBar',
  component: ActionBar,
  args: {
    canDraw: true,
    drawReason: null,
    canPass: true,
    canSubmit: true,
    factorMode: false,
    factorDisabled: false,
    isMyTurn: true,
    orientation: 'rail',
    showKbd: true,
    onDraw: fn(),
    onPass: fn(),
    onSubmit: fn(),
    onToggleFactor: fn(),
  },
  decorators: [
    (Story, ctx) => (
      <div
        style={{
          width:
            ctx.args.orientation === 'rail'
              ? 168
              : ctx.args.orientation === 'bottom'
                ? 390
                : 'auto',
          height: ctx.args.orientation === 'rail' ? 212 : 'auto',
          padding: 'var(--sp-3)',
          background: 'var(--bg)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ActionBar>

export const RailMyTurn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const submit = canvas.getByRole('button', { name: /出す/ })
    await expect(submit).toHaveAttribute('data-height', '55')
    await userEvent.click(submit)
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.keyboard('p')
    await expect(args.onPass).toHaveBeenCalledOnce()
  },
}

export const RailOffTurn: Story = {
  args: {
    canDraw: false,
    drawReason: 'not-your-turn',
    canPass: false,
    canSubmit: false,
    isMyTurn: false,
    factorDisabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /引く/ })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /出す/ })).toHaveAccessibleDescription(
      '手番ではありません',
    )
  },
}

export const RailFactorMode: Story = {
  args: { factorMode: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /素因数分解/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

export const RowDesktop: Story = {
  args: { orientation: 'row' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /引く/ })).toBeNull()
  },
}

export const BottomPortrait: Story = {
  args: { orientation: 'bottom', showKbd: false, drawReason: 'drawn', canDraw: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const b of canvas.getAllByRole('button')) {
      await expect(b).toHaveAttribute('data-height', '55')
    }
  },
}
