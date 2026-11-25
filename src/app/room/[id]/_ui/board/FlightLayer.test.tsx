import { DUR, EASE } from '@/design/motion'
import { renderWithProviders } from '@/test-utils'
import { act, fireEvent, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import {
  FlightLayer,
  type FlightLayerHandle,
  PENDING_ATTR,
  anchorSelector,
  buildGhost,
  measureAnchor,
} from './FlightLayer'
import type { FlightSpec } from './flight-plan'

const rect = (x: number, y: number, w: number, h: number) =>
  ({
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    x,
    y,
    toJSON: () => ({}),
  }) as DOMRect

const place = (el: Element | null, r: DOMRect) => {
  if (el) {
    ;(el as HTMLElement).getBoundingClientRect = () => r
  }
}

const drawSpec: FlightSpec = {
  key: 'draw-4S',
  from: { kind: 'deck' },
  to: { kind: 'hand-card', card: '4S' },
  fallback: { kind: 'hand' },
  path: 'arc',
  face: 'Back',
  faceTo: '4S',
  delay: 0,
  duration: DUR.lg,
  ease: EASE.inOut,
  hideTarget: true,
  absorb: false,
}

function Scene({ withCard = true }: { withCard?: boolean }) {
  return (
    <div>
      <span data-anchor="deck" />
      <div data-anchor="hand">
        {withCard ? <div data-card="4S" role="option" aria-selected={false} tabIndex={0} /> : null}
      </div>
    </div>
  )
}

const layout = (c: HTMLElement) => {
  place(c.querySelector('[data-anchor="deck"]'), rect(20, 20, 44, 64))
  place(c.querySelector('[data-anchor="hand"]'), rect(0, 300, 400, 140))
  place(c.querySelector('[data-card="4S"]'), rect(200, 320, 66, 96))
}

describe('anchorSelector', () => {
  it('scopes hand and field cards to their region', () => {
    expect(anchorSelector({ kind: 'hand-card', card: '4S' })).toBe(
      '[data-anchor="hand"] [data-card="4S"]',
    )
    expect(anchorSelector({ kind: 'field-card', card: 'KH' })).toBe(
      '[data-field-top] [data-card="KH"]',
    )
    expect(anchorSelector({ kind: 'cut-card', card: '5S' })).toBe('[data-cut-card="5S"]')
    expect(anchorSelector({ kind: 'seat', id: 'p2' })).toBe('[data-seat-anchor="p2"]')
  })
})

describe('measureAnchor', () => {
  it('skips zero-size matches and reports the centre', () => {
    const { container } = renderWithProviders(<Scene />)
    expect(measureAnchor({ kind: 'deck' })).toBeNull() // jsdom: 0 × 0
    layout(container)
    const box = measureAnchor({ kind: 'deck' })
    expect(box?.c).toEqual({ x: 42, y: 52 })
    expect(box?.h).toBe(64)
  })
})

describe('buildGhost', () => {
  it('starts at the source, lands on the target at the target size', () => {
    const g = buildGhost(
      'f',
      drawSpec,
      { c: { x: 42, y: 52 }, w: 44, h: 64, rotate: 0 },
      { c: { x: 233, y: 368 }, w: 66, h: 96, rotate: 2 },
      true,
      true,
    )
    expect([g.x[0], g.y[0]]).toEqual([42, 52])
    expect([g.x.at(-1), g.y.at(-1)]).toEqual([233, 368])
    expect(g.h).toBe(64)
    expect(g.scale[0]).toBe(1)
    expect(g.scale.at(-1)).toBeCloseTo(96 / 64)
    expect(g.rotate.at(-1)).toBe(2)
    // the arc bulges up from the chord: mid-flight sits lift/2 above the chord midpoint
    const mid = Math.floor(g.y.length / 2)
    expect(g.y[mid]).toBeCloseTo((52 + 368) / 2 - 20, 0)
  })

  it('absorbed flights shrink and never grow past the source size', () => {
    const g = buildGhost(
      'f',
      { ...drawSpec, to: { kind: 'seat', id: 'p2' }, absorb: true, faceTo: 'Back' },
      { c: { x: 0, y: 0 }, w: 44, h: 64, rotate: 0 },
      { c: { x: 300, y: 0 }, w: 120, h: 30, rotate: 0 },
      false,
      true,
    )
    expect(g.scale.at(-1)).toBeLessThan(1)
  })
})

describe('FlightLayer', () => {
  it('flies a ghost, hides the real target until it lands, and Esc skips', async () => {
    const ref = createRef<FlightLayerHandle>()
    const { container } = renderWithProviders(
      <>
        <Scene />
        <FlightLayer ref={ref} />
      </>,
      { reducedMotion: false },
    )
    layout(container)
    act(() => ref.current?.launch([drawSpec]))
    const ghost = document.querySelector('[data-flight-layer] [data-flight="draw-4S"]')
    expect(ghost).not.toBeNull()
    expect(document.querySelector('[data-flight-layer]')).toHaveClass('pointer-events-none')
    const target = container.querySelector('[data-card="4S"]')
    expect(target).toHaveAttribute(PENDING_ATTR)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[data-flight-layer]')).toBeNull())
    expect(target).not.toHaveAttribute(PENDING_ATTR)
  })

  it('reveals the target on its own after the flight', async () => {
    const ref = createRef<FlightLayerHandle>()
    const { container } = renderWithProviders(
      <>
        <Scene />
        <FlightLayer ref={ref} />
      </>,
      { reducedMotion: false },
    )
    layout(container)
    act(() => ref.current?.launch([{ ...drawSpec, duration: 0.01 }]))
    const target = container.querySelector('[data-card="4S"]')
    expect(target).toHaveAttribute(PENDING_ATTR)
    await waitFor(() => expect(target).not.toHaveAttribute(PENDING_ATTR), { timeout: 2000 })
  })

  it('falls back to the hand when the card slot is missing, and hides nothing', () => {
    const ref = createRef<FlightLayerHandle>()
    const { container } = renderWithProviders(
      <>
        <Scene withCard={false} />
        <FlightLayer ref={ref} />
      </>,
      { reducedMotion: false },
    )
    layout(container)
    act(() => ref.current?.launch([drawSpec]))
    expect(document.querySelector('[data-flight="draw-4S"]')).not.toBeNull()
    expect(container.querySelector(`[${PENDING_ATTR}]`)).toBeNull()
  })

  it('skips flights whose source is not on screen', () => {
    const ref = createRef<FlightLayerHandle>()
    renderWithProviders(
      <>
        <Scene />
        <FlightLayer ref={ref} />
      </>,
      { reducedMotion: false },
    )
    // nothing laid out: every anchor measures 0 × 0
    act(() => ref.current?.launch([drawSpec]))
    expect(document.querySelector('[data-flight-layer]')).toBeNull()
  })

  it('reduced motion: nothing flies and nothing is hidden', () => {
    const ref = createRef<FlightLayerHandle>()
    const { container } = renderWithProviders(
      <>
        <Scene />
        <FlightLayer ref={ref} />
      </>,
      { reducedMotion: true },
    )
    layout(container)
    act(() => ref.current?.launch([drawSpec]))
    expect(document.querySelector('[data-flight-layer]')).toBeNull()
    expect(container.querySelector(`[${PENDING_ATTR}]`)).toBeNull()
  })
})
