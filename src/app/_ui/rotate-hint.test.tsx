import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setRotateHintSuppressed, useRotateHintSuppressed } from './rotate-hint'

afterEach(() => setRotateHintSuppressed(false))

describe('rotate hint suppression', () => {
  it('re-renders subscribers when a page suppresses the hint', () => {
    const { result } = renderHook(() => useRotateHintSuppressed())
    expect(result.current).toBe(false)
    act(() => setRotateHintSuppressed(true))
    expect(result.current).toBe(true)
    act(() => setRotateHintSuppressed(false))
    expect(result.current).toBe(false)
  })
})
