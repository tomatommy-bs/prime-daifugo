import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ActionBar,
  type ActionBarProps,
  DRAW_REASON_TEXT,
  isActivatableTarget,
  isTypingTarget,
} from './ActionBar'

const setup = (over: Partial<ActionBarProps> = {}) => {
  const props: ActionBarProps = {
    canDraw: true,
    drawReason: null,
    canPass: true,
    canSubmit: true,
    factorMode: false,
    factorDisabled: false,
    isMyTurn: true,
    onDraw: vi.fn(),
    onPass: vi.fn(),
    onSubmit: vi.fn(),
    onToggleFactor: vi.fn(),
    orientation: 'rail',
    ...over,
  }
  renderWithProviders(<ActionBar {...props} />)
  return props
}
const btn = (name: RegExp) => screen.getByRole('button', { name })

describe('ActionBar', () => {
  it('renders the four actions with Japanese labels', () => {
    setup()
    for (const name of [/引く/, /パス/, /素因数分解/, /出す/]) {
      expect(btn(name)).toBeEnabled()
    }
  })

  it('rail: 出す is the 55px primary at the bottom, the others 44px', () => {
    setup({ orientation: 'rail' })
    const submit = btn(/出す/)
    expect(submit).toHaveAttribute('data-height', '55')
    expect(submit.style.height).toBe('55px')
    expect(btn(/引く/)).toHaveAttribute('data-height', '44')
    expect(btn(/素因数分解/)).toHaveAttribute('data-height', '44')
    const buttons = screen.getAllByRole('button')
    expect(buttons.at(-1)).toBe(submit)
  })

  it('bottom: four 55px buttons; row: no draw button (the deck draws)', () => {
    setup({ orientation: 'bottom' })
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAttribute('data-height', '55')
    }
  })

  it('row omits 引く', () => {
    setup({ orientation: 'row' })
    expect(screen.queryByRole('button', { name: /引く/ })).toBeNull()
    expect(btn(/出す/)).toBeInTheDocument()
  })

  it('disabled buttons explain why', () => {
    setup({
      canDraw: false,
      drawReason: 'drawn',
      canPass: false,
      canSubmit: false,
      isMyTurn: false,
      factorDisabled: true,
    })
    expect(btn(/引く/)).toBeDisabled()
    expect(btn(/引く/)).toHaveAccessibleDescription(DRAW_REASON_TEXT.drawn)
    expect(btn(/パス/)).toHaveAccessibleDescription('手番ではありません')
    expect(btn(/出す/)).toHaveAccessibleDescription('手番ではありません')
    expect(btn(/素因数分解/)).toHaveAccessibleDescription('カードを選んでください')
  })

  it('reflects factor mode with aria-pressed', () => {
    setup({ factorMode: true })
    expect(btn(/素因数分解/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicks call back', () => {
    const p = setup()
    fireEvent.click(btn(/引く/))
    fireEvent.click(btn(/パス/))
    fireEvent.click(btn(/素因数分解/))
    fireEvent.click(btn(/出す/))
    expect(p.onDraw).toHaveBeenCalledOnce()
    expect(p.onPass).toHaveBeenCalledOnce()
    expect(p.onToggleFactor).toHaveBeenCalledOnce()
    expect(p.onSubmit).toHaveBeenCalledOnce()
  })

  it('shortcuts D / P / F / Enter', () => {
    const p = setup()
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.keyDown(window, { key: 'P' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(p.onDraw).toHaveBeenCalledOnce()
    expect(p.onPass).toHaveBeenCalledOnce()
    expect(p.onToggleFactor).toHaveBeenCalledOnce()
    expect(p.onSubmit).toHaveBeenCalledOnce()
  })

  it('shortcuts respect disabled states, focused buttons, modifiers and inputs', () => {
    const p = setup({ canDraw: false, canPass: false, canSubmit: true, factorDisabled: true })
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.keyDown(window, { key: 'p' })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(btn(/出す/), { key: 'Enter' })
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })
    expect(p.onDraw).not.toHaveBeenCalled()
    expect(p.onPass).not.toHaveBeenCalled()
    expect(p.onToggleFactor).not.toHaveBeenCalled()
    expect(p.onSubmit).not.toHaveBeenCalled()
  })

  it('shortcuts can be turned off', () => {
    const p = setup({ shortcuts: false })
    fireEvent.keyDown(window, { key: 'd' })
    expect(p.onDraw).not.toHaveBeenCalled()
  })

  it('Kbd hints follow showKbd', () => {
    setup({ showKbd: true })
    expect(document.querySelector('[data-kbd="D"]')).not.toBeNull()
  })

  it('no Kbd hints without a fine pointer', () => {
    setup()
    expect(document.querySelector('[data-kbd]')).toBeNull()
  })

  it('helpers detect typing and activatable targets', () => {
    const input = document.createElement('input')
    const button = document.createElement('button')
    const div = document.createElement('div')
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(div)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isActivatableTarget(button)).toBe(true)
    expect(isActivatableTarget(div)).toBe(false)
  })
})
