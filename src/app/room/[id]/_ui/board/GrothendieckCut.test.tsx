import { renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CUT_AGAIN, CUT_CAPTION, CUT_TOTAL_MS, GrothendieckCut } from './GrothendieckCut'

afterEach(() => {
  vi.useRealTimers()
})

const root = (c: HTMLElement) => c.querySelector('[data-grothendieck-cut]') as HTMLElement

describe('GrothendieckCut', () => {
  it('renders nothing when inactive', () => {
    const { container } = renderWithProviders(<GrothendieckCut active={false} onDone={vi.fn()} />)
    expect(root(container)).toBeNull()
  })

  it('shows the caption and もう一度', () => {
    renderWithProviders(<GrothendieckCut active={true} onDone={vi.fn()} />)
    expect(screen.getByText('57 — グロタンディーク素数切り')).toBe(screen.getByText(CUT_CAPTION))
    expect(screen.getByText(CUT_AGAIN)).toBeInTheDocument()
  })

  it('draws the gold slash with full motion', () => {
    const { container } = renderWithProviders(<GrothendieckCut active={true} onDone={vi.fn()} />, {
      reducedMotion: false,
    })
    expect(container.querySelector('[data-slash]')).not.toBeNull()
    expect(root(container)).toHaveAttribute('data-motion', 'full')
  })

  it('cleaves the given cards into two halves each', () => {
    const { container } = renderWithProviders(
      <GrothendieckCut active={true} onDone={vi.fn()} cards={['5S', '7H']} />,
      { reducedMotion: false },
    )
    expect(container.querySelectorAll('[data-cleave] [data-half]')).toHaveLength(4)
  })

  it('tap skips and calls onDone once', () => {
    const onDone = vi.fn()
    renderWithProviders(<GrothendieckCut active={true} onDone={onDone} />)
    const button = screen.getByRole('button', { name: /グロタンディーク素数切り/ })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Esc skips and calls onDone', () => {
    const onDone = vi.fn()
    renderWithProviders(<GrothendieckCut active={true} onDone={onDone} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('finishes on its own after the ceremony', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    renderWithProviders(<GrothendieckCut active={true} onDone={onDone} />)
    act(() => {
      vi.advanceTimersByTime(CUT_TOTAL_MS - 1)
    })
    expect(onDone).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('not skippable: no button, Esc ignored', () => {
    const onDone = vi.fn()
    renderWithProviders(<GrothendieckCut active={true} onDone={onDone} skippable={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(CUT_CAPTION)
  })

  it('reduced motion: gold caption only, no slash or cleave', () => {
    const { container } = renderWithProviders(
      <GrothendieckCut active={true} onDone={vi.fn()} cards={['5S', '7H']} />,
      { reducedMotion: true },
    )
    expect(root(container)).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-slash]')).toBeNull()
    expect(container.querySelector('[data-cleave]')).toBeNull()
    expect(screen.getByText(CUT_CAPTION)).toBeInTheDocument()
  })
})
