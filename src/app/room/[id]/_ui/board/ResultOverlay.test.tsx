import { renderWithProviders } from '@/test-utils'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESULT_HOLD_MS, ResultOverlay, findOffendingIndex, groupValue } from './ResultOverlay'
import type { SubmitResultView } from './types'

const factorizeSpy = vi.hoisted(() => vi.fn())
vi.mock('@/design/math/factorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/design/math/factorize')>()
  factorizeSpy.mockImplementation(actual.factorize)
  return { ...actual, factorize: factorizeSpy }
})

afterEach(() => {
  vi.useRealTimers()
  factorizeSpy.mockClear()
})

const view = (partial: Partial<SubmitResultView>): SubmitResultView => ({
  kind: 'ok',
  value: 1013,
  penalty: 0,
  submitter: 'bob',
  ...partial,
})

const overlay = (c: HTMLElement) => c.querySelector('[data-result]') as HTMLElement

describe('factor helpers', () => {
  it('finds the first composite base factor, skipping exponents', () => {
    expect(findOffendingIndex(['2S', '*', '9H'])).toBe(1)
    expect(findOffendingIndex(['2S', '^', '4H', '*', '3C'])).toBeUndefined()
    expect(findOffendingIndex(['4S', '*', '3C'])).toBe(0)
    expect(findOffendingIndex(undefined)).toBeUndefined()
  })
  it('groupValue reads a number group', () => {
    expect(groupValue(['AS', '3H', '*', '9C'], 1)).toBe('9')
    expect(groupValue(['AS', '3H', '*', '9C'], 0)).toBe('13')
    expect(groupValue(['AS'], undefined)).toBeNull()
  })
})

describe('ResultOverlay', () => {
  it('renders nothing without a result (and factorizes nothing)', () => {
    const { container } = renderWithProviders(<ResultOverlay result={null} />)
    expect(overlay(container)).toBeNull()
    expect(factorizeSpy).not.toHaveBeenCalled()
  })

  it('ok: the value in --prime, ∈ ℙ, underline and a shimmer, no penalty', () => {
    const { container } = renderWithProviders(<ResultOverlay result={view({})} />, {
      reducedMotion: false,
    })
    expect(overlay(container)).toHaveAttribute('data-result', 'ok')
    expect(container.querySelector('[data-tone="prime"]')).toHaveAttribute('data-value', '1013')
    expect(screen.getByText('∈ ℙ')).toBeInTheDocument()
    expect(container.querySelector('[data-underline]')).not.toBeNull()
    expect(container.querySelector('[data-shimmer]')).not.toBeNull()
    expect(container.querySelector('[data-penalty]')).toBeNull()
    expect(screen.getByText('bob の提出')).toBeInTheDocument()
  })

  it('ok with a factorization shows the expression instead of ∈ ℙ', () => {
    renderWithProviders(
      <ResultOverlay result={view({ value: 18, factor: ['2S', '*', '3H', '^', '2C'] })} />,
    )
    expect(screen.getByRole('math')).toBeInTheDocument()
    expect(screen.queryByText('∈ ℙ')).toBeNull()
  })

  it('BASE_IS_NOT_PRIME: factor tree computed from the result, ✗ 合成数, +n', () => {
    const { container, rerender } = renderWithProviders(<ResultOverlay result={null} />)
    expect(factorizeSpy).not.toHaveBeenCalled()
    rerender(<ResultOverlay result={view({ kind: 'BASE_IS_NOT_PRIME', value: 221, penalty: 2 })} />)
    expect(factorizeSpy).toHaveBeenCalledWith(221)
    expect(overlay(container)).toHaveAttribute('data-result', 'BASE_IS_NOT_PRIME')
    expect(screen.getByText('221 = 13 · 17')).toBeInTheDocument()
    expect(screen.getByText('✗ 合成数')).toBeInTheDocument()
    expect(screen.getByText('+2 枚')).toBeInTheDocument()
  })

  it('BASE_IS_NOT_PRIME for 1 has no tree', () => {
    const { container } = renderWithProviders(
      <ResultOverlay result={view({ kind: 'BASE_IS_NOT_PRIME', value: 1, penalty: 1 })} />,
    )
    expect(container.querySelector('figure')).toBeNull()
    expect(screen.getByText('∉ ℙ')).toBeInTheDocument()
  })

  it('FACT_CONTAIN_NOT_PRIME: the offending factor is boxed with ∉ℙ', () => {
    const { container } = renderWithProviders(
      <ResultOverlay
        result={view({
          kind: 'FACT_CONTAIN_NOT_PRIME',
          value: 18,
          factor: ['2S', '*', '9H'],
          offendingIndex: 1,
          penalty: 3,
        })}
      />,
    )
    expect(overlay(container)).toHaveAttribute('data-result', 'FACT_CONTAIN_NOT_PRIME')
    expect(container.querySelector('[data-highlight="true"]')).toHaveTextContent('9')
    expect(screen.getByText('9 ∉ℙ')).toHaveAttribute('data-not-prime-box')
    expect(screen.getByText('+3 枚')).toBeInTheDocument()
  })

  it('FACT_CONTAIN_NOT_PRIME finds the offending factor when the index is missing', () => {
    renderWithProviders(
      <ResultOverlay
        result={view({
          kind: 'FACT_CONTAIN_NOT_PRIME',
          value: 12,
          factor: ['4S', '*', '3H'],
          penalty: 2,
        })}
      />,
    )
    expect(screen.getByText('4 ∉ℙ')).toBeInTheDocument()
  })

  it('INCORRECT_ANSWER: = morphs into ≠, both sides shown', () => {
    const { container } = renderWithProviders(
      <ResultOverlay
        result={view({
          kind: 'INCORRECT_ANSWER',
          value: 17,
          factor: ['2S', '*', '9H'],
          evaluated: 18,
          penalty: 2,
        })}
      />,
    )
    expect(overlay(container)).toHaveAttribute('data-result', 'INCORRECT_ANSWER')
    expect(container.querySelector('[data-neq]')).not.toBeNull()
    expect(screen.getByText('≠')).toHaveClass('sr-only')
    expect(screen.getByRole('math', { name: '2 掛ける 9' })).toBeInTheDocument()
    expect(screen.getByText('右辺 = 18')).toBeInTheDocument()
    expect(screen.getByText('+2 枚')).toBeInTheDocument()
  })

  it.each([
    ['ok', RESULT_HOLD_MS.full.ok],
    ['BASE_IS_NOT_PRIME', RESULT_HOLD_MS.full.fail],
  ] as const)('calls onDone once the %s visual has played', (kind, hold) => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    renderWithProviders(
      <ResultOverlay result={view({ kind, value: 221, penalty: 2 })} onDone={onDone} />,
      { reducedMotion: false },
    )
    act(() => {
      vi.advanceTimersByTime(hold - 1)
    })
    expect(onDone).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('tap skips to onDone', () => {
    const onDone = vi.fn()
    const { container } = renderWithProviders(<ResultOverlay result={view({})} onDone={onDone} />)
    fireEvent.click(overlay(container))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('announces politely', () => {
    const { container } = renderWithProviders(<ResultOverlay result={view({})} />)
    expect(overlay(container).tagName).toBe('OUTPUT')
    expect(overlay(container)).toHaveAttribute('aria-live', 'polite')
  })

  it('reduced motion: no shimmer, data-motion="reduced", information kept', () => {
    const { container } = renderWithProviders(
      <ResultOverlay result={view({ kind: 'BASE_IS_NOT_PRIME', value: 221, penalty: 2 })} />,
      { reducedMotion: true },
    )
    expect(overlay(container)).toHaveAttribute('data-motion', 'reduced')
    expect(container.querySelector('[data-shimmer]')).toBeNull()
    expect(screen.getByText('221 = 13 · 17')).toBeInTheDocument()
    expect(screen.getByText('+2 枚')).toBeInTheDocument()
  })
})
