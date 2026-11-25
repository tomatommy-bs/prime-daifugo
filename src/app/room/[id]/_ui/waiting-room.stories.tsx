import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { useState } from 'react'
import { WaitingRoom } from './waiting-room'

type PresenceEntry = serverToClient.PresenceEvent['presence'][number]

const RULE: PrimeDaifugoSetupData = {
  initNumCards: 11,
  maxSubmitNumCards: 4,
  timeLimit: 60,
  halfEvenNumbers: false,
}

const PLAYERS: PresenceEntry[] = [
  { id: 'a', name: 'alice', status: 'ready' },
  { id: 'b', name: 'bob', status: 'ready' },
  { id: 'c', name: 'carol', status: 'not-ready' },
  { id: 'd', name: 'ramanujan', status: 'not-ready' },
]

/** A live harness: ready toggles and rule changes round-trip like the server echo. */
function Harness({
  count,
  selfIndex,
}: {
  count: number
  selfIndex: number | null
}) {
  const [rule, setRule] = useState(RULE)
  const [presence, setPresence] = useState(PLAYERS.slice(0, count))
  const self = selfIndex === null ? undefined : presence[selfIndex]
  const setStatus = (status: PresenceEntry['status']) =>
    setPresence((list) => list.map((p) => (p.id === self?.id ? { ...p, status } : p)))
  return (
    <div style={{ width: 'min(987px, calc(100vw - 2 * var(--sp-4)))' }}>
      <WaitingRoom
        rule={rule}
        presence={presence}
        myPresence={self}
        onChangeRule={(partial) => setRule((r) => ({ ...r, ...partial }))}
        onSetReady={() => setStatus('ready')}
        onUnsetReady={() => setStatus('not-ready')}
        onGameStart={fn()}
      />
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'Screens/WaitingRoom',
  component: Harness,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Harness>

export const OnePlayer: Story = {
  args: { count: 1, selfIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /ゲーム開始/ })).toBeDisabled()
    await expect(canvas.getByText('2人以上で開始')).toBeInTheDocument()
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
  },
}

export const TwoPlayers: Story = {
  args: { count: 2, selfIndex: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /ゲーム開始/ })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: /取消/ }))
    await expect(canvas.getByRole('button', { name: /ゲーム開始/ })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: /準備OK/ }))
    await expect(canvas.getByRole('button', { name: /ゲーム開始/ })).toBeEnabled()
  },
}

export const ThreePlayers: Story = {
  args: { count: 3, selfIndex: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '300' }))
    await expect(canvas.getByRole('radio', { name: '300' })).toBeChecked()
    await expect(canvas.getByText('60 s → 300 s')).toBeInTheDocument()
  },
}

export const FourPlayers: Story = {
  args: { count: 4, selfIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('listitem', { name: /ramanujan/ })).toBeInTheDocument()
    await expect(canvas.queryByText(/空席/)).not.toBeInTheDocument()
  },
}

export const Observer: Story = {
  args: { count: 2, selfIndex: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('あなた')).not.toBeInTheDocument()
  },
}
