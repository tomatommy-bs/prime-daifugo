import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { ConnectionOverlay } from './ConnectionOverlay'

const HOME_LINK = /ホームへ/

/** A stand-in for the board underneath: it stays mounted and is desaturated while blocked. */
function FakeBoard() {
  return (
    <div className="grid h-[377px] place-items-center rounded-[var(--r-3)] border border-line bg-surface">
      <span className="num text-[length:var(--fs-3)] font-bold text-ink">13 &lt; 47 &lt; 1013</span>
    </div>
  )
}

const meta = {
  title: 'Board/ConnectionOverlay',
  component: ConnectionOverlay,
  args: { state: 'open', onReconnect: fn(), children: <FakeBoard /> },
} satisfies Meta<typeof ConnectionOverlay>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}

export const Connecting: Story = { args: { state: 'connecting' } }

export const WaitingSync: Story = { args: { state: 'waiting-sync' } }

export const Closed: Story = {
  args: { state: 'closed' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('接続が切れました')
    await userEvent.click(canvas.getByRole('button', { name: '再接続' }))
    await expect(args.onReconnect).toHaveBeenCalled()
  },
}

/** Another tab took the seat (close 4001): resuming here takes it back. */
export const Superseded: Story = {
  args: { state: 'closed', reason: 'superseded' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('別のタブで開かれています')
    await userEvent.click(canvas.getByRole('button', { name: 'このタブで再開' }))
    await expect(args.onReconnect).toHaveBeenCalled()
  },
}

/** The room was closed for good (close 4006): only a link home. */
export const RoomGone: Story = {
  args: { state: 'closed', reason: 'room-gone' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('この部屋は閉じられました')
    await expect(canvas.getByRole('link', { name: HOME_LINK })).toHaveAttribute('href', '/')
  },
}

export const SupersededDark: Story = { ...Superseded, globals: { colorScheme: 'dark' } }
export const RoomGoneDark: Story = { ...RoomGone, globals: { colorScheme: 'dark' } }
