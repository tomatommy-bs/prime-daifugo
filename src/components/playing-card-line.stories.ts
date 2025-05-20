import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PlayingCardLine } from './playing-card-line'

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'PlayingCardLine',
  component: PlayingCardLine,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    // layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {},
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: { onClickCard: fn(), cols: 10 },
} satisfies Meta<typeof PlayingCardLine>

export default meta
type Story = StoryObj<typeof meta>

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Basic: Story = {
  args: {
    cardIds: ['2C', '3D', 'JS'],
  },
}

export const Cards10: Story = {
  args: {
    cardIds: ['2C', '3D', 'JS', 'JC', 'JD', 'JH', 'AC', 'AS', 'AD', 'AH'],
  },
}

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
}

export const Cards20: Story = {
  args: {
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
}
