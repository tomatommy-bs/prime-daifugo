import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { PlayingCardLine } from './playing-card-line'

const meta = {
  title: 'Cards/PlayingCardLine',
  component: PlayingCardLine,
  tags: ['autodocs'],
  args: { onClickCard: fn(), cols: 10 },
} satisfies Meta<typeof PlayingCardLine>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: { cardIds: ['2C', '3D', 'JS'] },
  play: async ({ canvasElement, args }) => {
    const options = within(canvasElement).getAllByRole('option')
    await expect(options).toHaveLength(3)
    await userEvent.click(options[2])
    await expect(args.onClickCard).toHaveBeenCalledWith('JS', 2)
  },
}

export const Cards10: Story = {
  args: { cardIds: ['2C', '3D', 'JS', 'JC', 'JD', 'JH', 'AC', 'AS', 'AD', 'AH'] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('option')).toHaveLength(10)
  },
}

/** Repeated ids (as in the labo calculator) keep distinct layout ids. */
export const Cards15: Story = {
  args: {
    cardIds: [
      '2C',
      '3D',
      'JS',
      'JC',
      'JD',
      'JH',
      'AC',
      'AS',
      'AD',
      'AH',
      '2C',
      '3D',
      'JS',
      'JC',
      'JD',
    ],
  },
  play: async ({ canvasElement }) => {
    const ids = within(canvasElement)
      .getAllByRole('option')
      .map((o) => o.getAttribute('data-layout-id'))
    await expect(new Set(ids).size).toBe(15)
  },
}

export const Cards20: Story = {
  args: {
    cols: undefined,
    size: 's',
    cardIds: [
      'AC',
      'AD',
      'AH',
      'AS',
      '2C',
      '2D',
      '2H',
      '2S',
      '3C',
      '3D',
      '3H',
      '3S',
      '4C',
      '4D',
      '4H',
      '4S',
      '5C',
      '5D',
      '5H',
      '5S',
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('option')).toHaveLength(20)
  },
}
