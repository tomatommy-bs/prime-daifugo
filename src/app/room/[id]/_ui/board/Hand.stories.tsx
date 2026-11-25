import { type CardId, cardIds as ALL } from '@/game-card/src'
import { compareCard } from '@/utils/play-card'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, waitFor, within } from '@storybook/test'
import { LayoutGroup } from 'framer-motion'
import { useState } from 'react'
import { Hand } from './Hand'
import { SubmitTray } from './SubmitTray'

const ELEVEN: CardId[] = ['AS', '2H', '3C', '4D', '5S', '7H', '9C', '10D', 'JS', 'QH', 'KC']

const meta = {
  title: 'Board/Hand',
  component: Hand,
  parameters: { layout: 'fullscreen' },
  args: { cardIds: ELEVEN, isMyTurn: true, mode: 'basic', onSelect: fn() },
  decorators: [
    (Story) => (
      <div style={{ padding: 'var(--sp-5) var(--sp-4)', maxWidth: 900, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hand>

export default meta
type Story = StoryObj<typeof meta>

/** My turn: the arc fan with the `--mod` rule and the 4px lift. */
export const MyTurnFan: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const listbox = canvas.getByRole('listbox', { name: '手札' })
    await waitFor(() => expect(listbox).toHaveAttribute('data-layout', 'fan'))
    const options = within(listbox).getAllByRole('option')
    options[0].focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await expect(options[2]).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith('3C')
  },
}

/** Off turn: only saturation drops; the cards stay selectable. */
export const OffTurn: Story = {
  args: { isMyTurn: false, showValues: true },
  play: async ({ canvasElement, args }) => {
    const listbox = within(canvasElement).getByRole('listbox', { name: '手札' })
    await expect(listbox.style.filter).toMatch(/^saturate\(0?\.618\)$/)
    await userEvent.click(within(listbox).getAllByRole('option')[0])
    await expect(args.onSelect).toHaveBeenCalledWith('AS')
  },
}

/** 30 cards in a narrow container: the slice would drop below 32px, so it scrolls. */
export const ScrollSnap: Story = {
  args: { cardIds: ALL.slice(0, 30) as CardId[] },
  decorators: [
    (Story) => (
      <div style={{ width: 390 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const listbox = within(canvasElement).getByRole('listbox', { name: '手札' })
    await waitFor(() => expect(listbox).toHaveAttribute('data-layout', 'scroll'))
  },
}

/** Freshly drawn cards carry the gold tick for 2584 ms. */
export const Fresh: Story = {
  args: { freshIds: ['7H', 'KC'] },
  play: async ({ canvasElement }) => {
    const fresh = canvasElement.querySelectorAll('[role="option"][data-state="fresh"]')
    await expect(fresh).toHaveLength(2)
  },
}

export const FactorMode: Story = {
  args: { mode: 'factor' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-mode="factor"]')).not.toBeNull()
  },
}

function HandAndTray() {
  const [hand, setHand] = useState<CardId[]>(ELEVEN)
  const [tray, setTray] = useState<CardId[]>([])
  const [shakeKey, setShakeKey] = useState(0)
  const select = (card: CardId) => {
    setHand((h) => h.filter((c) => c !== card))
    setTray((t) => [...t, card])
  }
  const remove = (card: CardId) => {
    setTray((t) => t.filter((c) => c !== card))
    setHand((h) => [...h, card].sort(compareCard))
  }
  const reset = () => {
    setHand((h) => [...h, ...tray].sort(compareCard))
    setTray([])
  }
  return (
    <LayoutGroup id="board">
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SubmitTray
              cardIds={tray}
              fieldTop={['4S', '7D']}
              onRemove={remove}
              onReset={reset}
              shakeKey={shakeKey}
            />
          </div>
          <button
            type="button"
            className="rounded-[var(--r-2)] bg-prime px-[var(--sp-4)] font-semibold text-on-prime"
            style={{ minHeight: 55 }}
            onClick={() => setShakeKey((k) => k + 1)}
          >
            出す ↑
          </button>
        </div>
        <Hand cardIds={hand} isMyTurn={true} mode="basic" onSelect={select} showValues={true} />
      </div>
    </LayoutGroup>
  )
}

/** Hand → tray flights share `layoutId`s (#13, #14); 出す replays the blocked shake (#18). */
export const WithTray: Story = {
  render: () => <HandAndTray />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hand = canvas.getByRole('listbox', { name: '手札' })
    await userEvent.click(within(hand).getByRole('option', { name: 'ダイヤの4, 4' }))
    await userEvent.click(within(hand).getByRole('option', { name: 'ハートの7, 7' }))
    const tray = canvas.getByRole('listbox', { name: '提出' })
    await expect(within(tray).getAllByRole('option')).toHaveLength(2)
    await expect(canvasElement.querySelector('[data-check="greater"]')).toHaveAttribute(
      'data-ok',
      'false',
    )
  },
}
