import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import { useState } from 'react'
import { HomeHero, type HomeHeroVariant, INTRO_KEY } from './home-hero'

/** Clears the session flag so every mount of the story replays the intro. */
function Replay({ variant, reduced }: { variant: HomeHeroVariant; reduced: boolean }) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative isolate" style={{ width: variant === 'compact' ? 467 : 546 }}>
      <HomeHero key={run} variant={variant} reduced={reduced} intro={reduced ? 'static' : 'play'} />
      <button
        type="button"
        className="mt-fib-3 text-ink-muted underline"
        onClick={() => {
          try {
            window.sessionStorage.removeItem(INTRO_KEY)
          } catch {
            // ignore
          }
          setRun((r) => r + 1)
        }}
      >
        もう一度再生
      </button>
    </div>
  )
}

const meta: Meta<typeof Replay> = {
  title: 'Screens/HomeHero',
  component: Replay,
  args: { variant: 'stack', reduced: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['stack', 'compact', 'portrait'] },
  },
}
export default meta

type Story = StoryObj<typeof Replay>

export const Intro: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: '素数大富豪' })).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-intro="play"]')).not.toBeNull()
  },
}

export const Compact: Story = {
  args: { variant: 'compact' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hero-strip="compact"]')).not.toBeNull()
  },
}

export const Portrait: Story = {
  args: { variant: 'portrait' },
}

export const Static: Story = {
  args: { reduced: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-intro="static"]')).not.toBeNull()
    await expect(canvasElement.querySelector('[data-strike]')).toBeNull()
  },
}
