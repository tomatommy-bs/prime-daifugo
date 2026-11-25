import type { CardId } from '@/game-card/src'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { LayoutGroup } from 'framer-motion'
import { useEffect, useState } from 'react'
import { FieldStack } from './FieldStack'
import { SeatRing } from './SeatRing'
import { buildSeats } from './seat-model'

const NAMES = ['alice', 'bob', 'carol', 'dave']
const RULE = { initNumCards: 11, maxSubmitNumCards: 4, timeLimit: 60, halfEvenNumbers: false }
const FIELD: CardId[][] = [['KS'], ['4H', '7C'], ['10D', 'KH']]

function seats({
  n,
  current = 0,
  observer = false,
}: { n: number; current?: number; observer?: boolean }) {
  const ids = NAMES.slice(0, n).map((_, i) => `p${i + 1}`)
  const players = Object.fromEntries(
    ids.map((id, i) => [
      id,
      { hand: Array.from({ length: 7 + i }, () => 'AS' as CardId), drawRight: true },
    ]),
  )
  const playOrder = observer ? [...ids, 'obs'] : ids
  return buildSeats({
    gameState: { players, deckTopPlayer: ids[1] ?? null, rule: RULE },
    ctx: { playOrder, currentPlayer: playOrder[current] },
    presence: [
      ...NAMES.slice(0, n).map((name, i) => ({ id: ids[i], name })),
      ...(observer ? [{ id: 'obs', name: 'eve' }] : []),
    ],
    selfId: 'p1',
    passedIds: n > 3 ? ['p3'] : [],
    leftTime: 42,
  })
}

const W = 980
const H = 560

const meta = {
  title: 'Board/Table/SeatRing',
  component: SeatRing,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ padding: 'var(--sp-4)' }}>
        <LayoutGroup id="board">
          <Story />
        </LayoutGroup>
      </div>
    ),
  ],
  args: {
    seats: seats({ n: 4 }),
    width: W,
    height: H,
    children: <FieldStack field={FIELD} leadName="bob" />,
  },
} satisfies Meta<typeof SeatRing>

export default meta
type Story = StoryObj<typeof meta>

export const Two: Story = { args: { seats: seats({ n: 2, current: 1 }) } }
export const Three: Story = { args: { seats: seats({ n: 3, current: 2 }) } }

export const Four: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('list', { name: 'ℤ/4ℤ 手番順' })).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-turn-radius]')).not.toBeNull()
  },
}

/** Quirk: the turn is on an observer, so there is no radius and no lit seat. */
export const ObserverTurn: Story = {
  args: { seats: seats({ n: 3, observer: true, current: 3 }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-turn-radius]')).toBeNull()
  },
}

function Live() {
  const [k, setK] = useState(0)
  const [shimmer, setShimmer] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setK((v) => (v + 1) % 4), 1400)
    return () => clearInterval(id)
  }, [])
  return (
    <div>
      <button type="button" onClick={() => setShimmer((s) => s + 1)}>
        prime play
      </button>
      <SeatRing seats={seats({ n: 4, current: k })} width={W} height={H} shimmerKey={shimmer}>
        <FieldStack field={FIELD} leadName="bob" />
      </SeatRing>
    </div>
  )
}

/** The radius rotates along the shortest arc; "prime play" shimmers the sieve once. */
export const TurnAndShimmer: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'prime play' }))
    await expect(canvasElement.querySelector('[data-sieve-wave]')).not.toBeNull()
  },
}

/** Game end: the winner flashes gold and the sieve ripples out from that seat. */
export const WinnerRipple: Story = {
  args: { rippleFromId: 'p2', seats: seats({ n: 4, current: 1 }) },
}

export const FourDark: Story = { ...Four, globals: { colorScheme: 'dark' } }
export const ThreeDark: Story = { ...Three, globals: { colorScheme: 'dark' } }
export const ObserverTurnDark: Story = { ...ObserverTurn, globals: { colorScheme: 'dark' } }
