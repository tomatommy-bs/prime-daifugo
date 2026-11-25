import type { CardId } from '@/game-card/src'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { LayoutGroup } from 'framer-motion'
import { useEffect, useState } from 'react'
import { SeatLine } from './SeatLine'
import { buildSeats } from './seat-model'

const NAMES = ['alice', 'bob', 'carol', 'dave']
const RULE = { initNumCards: 11, maxSubmitNumCards: 4, timeLimit: 60, halfEvenNumbers: false }

function seats({
  n,
  current = 0,
  observer = false,
  leftTime = 42,
}: { n: number; current?: number; observer?: boolean; leftTime?: number }) {
  const ids = NAMES.slice(0, n).map((_, i) => `p${i + 1}`)
  const players = Object.fromEntries(
    ids.map((id, i) => [
      id,
      { hand: Array.from({ length: 9 - 2 * i }, () => 'AS' as CardId), drawRight: true },
    ]),
  )
  const presence = [
    ...NAMES.slice(0, n).map((name, i) => ({ id: ids[i], name })),
    ...(observer ? [{ id: 'obs', name: 'eve' }] : []),
  ]
  const playOrder = observer ? [...ids, 'obs'] : ids
  return buildSeats({
    gameState: { players, deckTopPlayer: ids[1] ?? null, rule: RULE },
    ctx: { playOrder, currentPlayer: playOrder[current] },
    presence,
    selfId: 'p1',
    passedIds: n > 2 ? [ids[n - 1]] : [],
    leftTime,
  })
}

const meta = {
  title: 'Board/Table/SeatLine',
  component: SeatLine,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ padding: 'var(--sp-3)', maxWidth: 756 }}>
        <LayoutGroup id="board">
          <Story />
        </LayoutGroup>
      </div>
    ),
  ],
  args: { seats: seats({ n: 3 }), n: 3 },
} satisfies Meta<typeof SeatLine>

export default meta
type Story = StoryObj<typeof meta>

export const Two: Story = { args: { seats: seats({ n: 2 }), n: 2 } }

export const Three: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('ℤ/3ℤ')).toBeInTheDocument()
    await expect(canvas.getByText('↺')).toBeInTheDocument()
    await expect(canvas.getByRole('timer')).toHaveAttribute('aria-valuenow', '42')
  },
}

export const Four: Story = { args: { seats: seats({ n: 4, current: 2, leftTime: 8 }), n: 4 } }

/** Quirk: the turn lands on an observer, so no seat is lit and the clock shows —. */
export const ObserverTurn: Story = {
  args: { seats: seats({ n: 3, observer: true, current: 3 }), n: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('list', { name: '観戦' })).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-turn-pointer]')).toBeNull()
  },
}

function Rotating({ n }: { n: number }) {
  const [k, setK] = useState(0)
  const [left, setLeft] = useState(12)
  useEffect(() => {
    const id = setInterval(() => {
      setLeft((t) => {
        if (t <= 0) {
          setK((v) => (v + 1) % n)
          return 12
        }
        return t - 1
      })
    }, 400)
    return () => clearInterval(id)
  }, [n])
  return <SeatLine seats={seats({ n, current: k, leftTime: left })} n={n} />
}

/** The pointer slides along the residue line (shared `layoutId="turn-pointer"`). */
export const TurnPointer: Story = { render: () => <Rotating n={4} /> }

export const ThreeDark: Story = { ...Three, globals: { colorScheme: 'dark' } }
export const FourDark: Story = { ...Four, globals: { colorScheme: 'dark' } }
export const ObserverTurnDark: Story = { ...ObserverTurn, globals: { colorScheme: 'dark' } }
