import { mockMatchMedia } from '@/test-utils'
import { act, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LAYOUT_QUERIES, resolveLayoutMode, useLayoutMode } from './use-layout-mode'

describe('useLayoutMode', () => {
  it.each([
    ['compact', { [LAYOUT_QUERIES.compact]: true }],
    ['portrait', { [LAYOUT_QUERIES.portrait]: true }],
    ['wide', { [LAYOUT_QUERIES.wide]: true }],
    ['regular', {}],
  ] as const)('%s', (mode, map) => {
    mockMatchMedia(map)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current).toBe(mode)
  })

  it('priority: compact > portrait > wide > regular', () => {
    expect(resolveLayoutMode(() => true)).toBe('compact')
    expect(resolveLayoutMode((q) => q !== LAYOUT_QUERIES.compact)).toBe('portrait')
    expect(
      resolveLayoutMode((q) => q === LAYOUT_QUERIES.wide || q === LAYOUT_QUERIES.portrait),
    ).toBe('portrait')
    expect(resolveLayoutMode(() => false)).toBe('regular')
  })

  it('updates when a media query changes', () => {
    mockMatchMedia({})
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current).toBe('regular')
    act(() => mockMatchMedia({ [LAYOUT_QUERIES.compact]: true }))
    expect(result.current).toBe('compact')
    act(() => mockMatchMedia({ [LAYOUT_QUERIES.wide]: true }))
    expect(result.current).toBe('wide')
  })

  it("renders 'regular' on the server", () => {
    mockMatchMedia({ [LAYOUT_QUERIES.compact]: true })
    const Probe = () => createElement('span', null, useLayoutMode())
    expect(renderToString(createElement(Probe))).toContain('regular')
  })
})
