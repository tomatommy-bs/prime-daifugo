import type { CardId } from '@/game-card/src'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { LayoutGroup } from 'framer-motion'
import { useState } from 'react'
import { FieldSequence } from './FieldSequence'
import { FieldStack } from './FieldStack'
import { ResultOverlay } from './ResultOverlay'

const PLAYS: CardId[][] = [['KS'], ['4H', '7C'], ['10D', 'KH'], ['JS', '3C']]

const meta = {
  title: 'Board/Table/FieldStack',
  component: FieldStack,
  decorators: [
    (Story) => (
      <div style={{ minWidth: 560, minHeight: 220, display: 'grid', placeItems: 'center' }}>
        <LayoutGroup id="board">
          <Story />
        </LayoutGroup>
      </div>
    ),
  ],
  args: { field: PLAYS.slice(0, 3), leadName: 'bob' },
} satisfies Meta<typeof FieldStack>

export default meta
type Story = StoryObj<typeof meta>

export const Sequence: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('k = 2 枚 · > 1013')).toBeInTheDocument()
  },
}

export const Free: Story = {
  args: { field: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('k = 自由')).toBeInTheDocument()
  },
}

export const Collapsed: Story = { args: { field: [['2S'], ['5S'], ...PLAYS] } }

export const WithResult: Story = {
  args: {
    field: PLAYS.slice(0, 3),
    resultOverlay: (
      <ResultOverlay result={{ kind: 'ok', value: 1013, penalty: 0, submitter: 'bob' }} />
    ),
  },
}

function Playthrough() {
  const [i, setI] = useState(1)
  const field = i > PLAYS.length ? [] : PLAYS.slice(0, i)
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'center' }}>
      <FieldStack field={field} leadName="bob" />
      <button type="button" onClick={() => setI((v) => (v > PLAYS.length ? 1 : v + 1))}>
        {i >= PLAYS.length ? '流す' : '次の手'}
      </button>
    </div>
  )
}

/** Each play pushes the previous top into the sequence; the last step flows (strike-out). */
export const Steps: Story = {
  render: () => <Playthrough />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '次の手' }))
    await expect(canvas.getByText('k = 2 枚 · > 47')).toBeInTheDocument()
  },
}

/** The phyllotaxis variant for long histories (wide layout). */
export const Phyllotaxis: Story = {
  render: () => (
    <FieldSequence values={[2, 3, 5, 7, 11, 13, 17, 19, 23, 29]} layout="phyllotaxis" />
  ),
}

export const SequenceDark: Story = { ...Sequence, globals: { colorScheme: 'dark' } }
export const FreeDark: Story = { ...Free, globals: { colorScheme: 'dark' } }
