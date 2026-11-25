import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { useState } from 'react'
import { ResultOverlay } from './ResultOverlay'
import type { SubmitResultView } from './types'

const meta = {
  title: 'Board/Table/ResultOverlay',
  component: ResultOverlay,
  decorators: [
    (Story) => (
      <div
        style={{
          position: 'relative',
          width: 520,
          height: 260,
          border: '1px dashed var(--line)',
          borderRadius: 'var(--r-3)',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: { result: { kind: 'ok', value: 1013, penalty: 0, submitter: 'bob' } },
} satisfies Meta<typeof ResultOverlay>

export default meta
type Story = StoryObj<typeof meta>

export const Ok: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('∈ ℙ')).toBeInTheDocument()
  },
}

export const OkFactor: Story = {
  args: {
    result: {
      kind: 'ok',
      value: 18,
      factor: ['2S', '*', '3H', '^', '2C'],
      penalty: 0,
      submitter: 'bob',
    },
  },
}

export const NotPrime: Story = {
  args: { result: { kind: 'BASE_IS_NOT_PRIME', value: 221, penalty: 2, submitter: 'alice' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('221 = 13 · 17')).toBeInTheDocument()
    await expect(canvas.getByText('+2 枚')).toBeInTheDocument()
  },
}

export const FactorNotPrime: Story = {
  args: {
    result: {
      kind: 'FACT_CONTAIN_NOT_PRIME',
      value: 18,
      factor: ['2S', '*', '9H'],
      offendingIndex: 1,
      penalty: 3,
      submitter: 'carol',
    },
  },
}

export const IncorrectAnswer: Story = {
  args: {
    result: {
      kind: 'INCORRECT_ANSWER',
      value: 17,
      factor: ['2S', '*', '9H'],
      evaluated: 18,
      penalty: 2,
      submitter: 'dave',
    },
  },
}

const ALL: SubmitResultView[] = [
  { kind: 'ok', value: 1013, penalty: 0, submitter: 'bob' },
  { kind: 'BASE_IS_NOT_PRIME', value: 1001, penalty: 4, submitter: 'alice' },
  {
    kind: 'FACT_CONTAIN_NOT_PRIME',
    value: 12,
    factor: ['4S', '*', '3H'],
    penalty: 2,
    submitter: 'carol',
  },
  {
    kind: 'INCORRECT_ANSWER',
    value: 17,
    factor: ['2S', '*', '9H'],
    evaluated: 18,
    penalty: 2,
    submitter: 'dave',
  },
]

function Cycle() {
  const [i, setI] = useState(0)
  return <ResultOverlay result={ALL[i % ALL.length]} onDone={() => setI((v) => v + 1)} />
}

/** Each visual calls onDone when it has played; the next one follows. */
export const Sequence: Story = { render: () => <Cycle /> }

export const NotPrimeDark: Story = { ...NotPrime, globals: { colorScheme: 'dark' } }
export const OkDark: Story = { ...Ok, globals: { colorScheme: 'dark' } }
export const IncorrectAnswerDark: Story = { ...IncorrectAnswer, globals: { colorScheme: 'dark' } }
