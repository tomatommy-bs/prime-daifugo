import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import NotifyMessageContent, { EndNotice, SystemNotice } from '../notification-message'
import { ProofLog } from './ProofLog'
import type { LogEntry } from './types'

const ENTRIES: LogEntry[] = [
  { id: '7', node: <EndNotice winner="bob" />, kind: 'end' },
  {
    id: '6',
    node: <NotifyMessageContent.OnSubmitSuccessful sender="bob" submit={['10S', 'AH', '3C']} />,
    kind: 'play',
  },
  { id: '5', node: <NotifyMessageContent.OnPass sender="carol" />, kind: 'pass' },
  {
    id: '4',
    node: (
      <NotifyMessageContent.OnSubmitWithWrongEquation
        sender="alice"
        submit={['2S', '2H', 'AC']}
        factor={['3S', '*', '7H']}
      />
    ),
    kind: 'fail',
  },
  {
    id: '3',
    node: <NotifyMessageContent.OnSubmitNotPrime sender="alice" submit={['2S', 'AH']} />,
    kind: 'fail',
  },
  {
    id: '2',
    node: <NotifyMessageContent.OnSubmitSuccessful sender="bob" submit={['AS', '3H']} />,
    kind: 'play',
  },
  { id: '1', node: <SystemNotice>ゲームを開始します</SystemNotice>, kind: 'system' },
]

const meta: Meta<typeof ProofLog> = {
  title: 'Board/ProofLog',
  component: ProofLog,
  args: { entries: ENTRIES },
}
export default meta

type Story = StoryObj<typeof ProofLog>

export const Sidebar: Story = {
  args: { variant: 'sidebar' },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 520, background: 'var(--bg)' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = within(canvas.getByRole('list', { name: '証明ログ' })).getAllByRole('listitem')
    await expect(items[0]).toHaveAttribute('data-n', '7')
    await expect(items[0]).toHaveAttribute('data-kind', 'end')
  },
}

function LiveFeed() {
  const [entries, setEntries] = useState<LogEntry[]>(ENTRIES.slice(3))
  return (
    <div style={{ width: 320, height: 480, display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <button
        type="button"
        onClick={() =>
          setEntries((prev) => [
            {
              id: `n${prev.length}`,
              node: <NotifyMessageContent.OnPass sender="dave" />,
              kind: 'pass',
            },
            ...prev,
          ])
        }
      >
        追加
      </button>
      <ProofLog entries={entries} variant="sidebar" />
    </div>
  )
}

export const PushAtTop: Story = {
  render: () => <LiveFeed />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '追加' }))
    const items = within(canvas.getByRole('list', { name: '証明ログ' })).getAllByRole('listitem')
    await expect(items[0]).toHaveTextContent('dave')
  },
}

export const Drawer: Story = {
  args: { variant: 'drawer', opened: true },
  play: async () => {
    const body = within(document.body)
    await expect(await body.findByText('ゲームを開始します')).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { variant: 'sidebar', entries: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('まだ何も証明されていません')).toBeInTheDocument()
  },
}
