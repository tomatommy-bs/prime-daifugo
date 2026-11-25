import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { GameCard } from './game-card'

const meta = {
  title: 'Cards/GameCard',
  component: GameCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { onClick: fn(), fontSize: '5rem' },
} satisfies Meta<typeof GameCard>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: { card: '2C' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('option', { name: 'クラブの2, 2' })
    await userEvent.click(card)
    await expect(args.onClick).toHaveBeenCalled()
  },
}

export const Court: Story = {
  args: { card: 'JH' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('option', { name: 'ハートのJ, 11' }),
    ).toBeInTheDocument()
  },
}

/** The Ulam-spiral back: 21×21, primes as squares, the centre 1 in vermilion. */
export const Back: Story = {
  args: { card: 'Back', fontSize: '12rem' },
  play: async ({ canvasElement }) => {
    const back = within(canvasElement).getByRole('option', { name: '山札' })
    await expect(back).toHaveAttribute('viewBox', '0 0 201.58 282.22')
  },
}
