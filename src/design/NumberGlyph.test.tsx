import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberGlyph } from './NumberGlyph'

const root = (c: HTMLElement) => c.querySelector('[data-tone]') as HTMLElement

describe('NumberGlyph', () => {
  it('renders the placeholder for null', () => {
    const { container } = renderWithProviders(<NumberGlyph value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(root(container)).toHaveAttribute('data-empty', 'true')
  })
  it('accepts a custom placeholder', () => {
    renderWithProviders(<NumberGlyph value={null} placeholder="?" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
  it('uses tabular mono numerals', () => {
    const { container } = renderWithProviders(<NumberGlyph value={1013} />)
    expect(root(container)).toHaveClass('num', 'tabular-nums', 'slashed-zero')
    expect(screen.getByText('1013')).toBeInTheDocument() // accessible text
    expect(container.querySelectorAll('[data-digit]')).toHaveLength(4)
  })
  it.each([
    ['ink', 'text-ink'],
    ['muted', 'text-ink-muted'],
    ['prime', 'text-prime'],
    ['gold', 'text-gold'],
    ['danger', 'text-danger'],
    ['factor', 'text-factor'],
  ] as const)('tone %s → %s', (tone, cls) => {
    const { container } = renderWithProviders(<NumberGlyph value={7} tone={tone} />)
    expect(root(container)).toHaveClass(cls)
  })
  it('sizes with the type scale', () => {
    const { container } = renderWithProviders(<NumberGlyph value={7} size={-1} />)
    expect(root(container).getAttribute('style')).toContain('var(--fs--1)')
  })
  it('srLabel replaces the read-out text', () => {
    renderWithProviders(<NumberGlyph value={42} srLabel="残り 42 秒" />)
    expect(screen.getByText('残り 42 秒')).toHaveClass('sr-only')
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })
  it('srLabel for an empty value', () => {
    renderWithProviders(<NumberGlyph value={null} srLabel="未接続" />)
    expect(screen.getByText('未接続')).toHaveClass('sr-only')
  })
  it('aria-live is off by default and opt-in', () => {
    const { container, rerender } = renderWithProviders(<NumberGlyph value={1} />)
    expect(root(container)).not.toHaveAttribute('aria-live')
    rerender(<NumberGlyph value={2} live={true} />)
    expect(root(container)).toHaveAttribute('aria-live', 'polite')
  })
  it('rolls only to the new value (both directions)', () => {
    const { container, rerender } = renderWithProviders(<NumberGlyph value={13} />)
    rerender(<NumberGlyph value={47} />)
    expect(screen.getByText('47')).toBeInTheDocument()
    rerender(<NumberGlyph value={5} />)
    expect(root(container)).toHaveAttribute('data-value', '5')
  })
  it('marks reduced motion', () => {
    const { container } = renderWithProviders(<NumberGlyph value={3} />, { reducedMotion: true })
    expect(root(container)).toHaveAttribute('data-motion', 'reduced')
  })
})
