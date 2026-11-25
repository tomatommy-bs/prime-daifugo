import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { DeckPile } from './DeckPile'

const meta = {
  title: 'Board/Table/DeckPile',
  component: DeckPile,
  args: { count: 23, canDraw: true, onDraw: fn() },
} satisfies Meta<typeof DeckPile>

export default meta
type Story = StoryObj<typeof meta>

export const CanDraw: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /引く/ }))
    await expect(args.onDraw).toHaveBeenCalled()
  },
}

export const Drawn: Story = {
  args: { canDraw: false, disabledReason: 'drawn' },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: /引く/ })
    await expect(button).toHaveAccessibleDescription('ドロー済み')
    await userEvent.click(button)
    await expect(args.onDraw).not.toHaveBeenCalled()
  },
}

export const NotYourTurn: Story = { args: { canDraw: false, disabledReason: 'not-your-turn' } }
export const Empty: Story = { args: { count: 0, canDraw: false, disabledReason: 'empty' } }
export const Compact: Story = { args: { compact: true, count: 2 } }

export const CanDrawDark: Story = { ...CanDraw, globals: { colorScheme: 'dark' } }
export const EmptyDark: Story = { ...Empty, globals: { colorScheme: 'dark' } }
