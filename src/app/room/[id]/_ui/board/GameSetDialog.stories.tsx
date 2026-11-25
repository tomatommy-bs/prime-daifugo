import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { GameSetDialog } from './GameSetDialog'

const STANDINGS = [
  { name: 'alice', handCount: 3 },
  { name: 'bob', handCount: 0 },
  { name: 'carol', handCount: 5 },
  { name: 'dave', handCount: 1 },
]

const meta = {
  title: 'Board/Table/GameSetDialog',
  component: GameSetDialog,
  parameters: { layout: 'fullscreen' },
  args: { opened: true, winner: 'bob', standings: STANDINGS, plays: 23, onNextRound: fn() },
} satisfies Meta<typeof GameSetDialog>

export default meta
type Story = StoryObj<typeof meta>

export const FourPlayers: Story = {
  play: async ({ canvasElement, args }) => {
    // Mantine renders the modal in a portal on document.body
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByText('Q.E.D. ∎')).toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: /次のラウンドを開始/ }))
    await expect(args.onNextRound).toHaveBeenCalled()
  },
}

export const TwoPlayers: Story = {
  args: { standings: STANDINGS.slice(0, 2), plays: 9 },
}

export const ThreePlayers: Story = {
  args: { winner: 'dave', standings: [STANDINGS[0], STANDINGS[2], { name: 'dave', handCount: 0 }] },
}

export const CannotStart: Story = { args: { canStart: false } }

/** An observer of this round can join the next one (rebuild spec §3.7). */
export const ObserverJoin: Story = {
  args: { isObserver: true, selfReady: false, onToggleReady: fn() },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: '次のラウンドに参加' }))
    await expect(args.onToggleReady).toHaveBeenCalled()
  },
}

export const PlayerReadyToggle: Story = {
  args: { selfReady: false, onToggleReady: fn() },
}

export const PlayerReady: Story = {
  args: { selfReady: true, onToggleReady: fn() },
}

export const FourPlayersDark: Story = { ...FourPlayers, globals: { colorScheme: 'dark' } }
export const TwoPlayersDark: Story = { ...TwoPlayers, globals: { colorScheme: 'dark' } }
export const ObserverJoinDark: Story = { ...ObserverJoin, globals: { colorScheme: 'dark' } }
