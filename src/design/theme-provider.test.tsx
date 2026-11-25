import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cssVariablesResolver, theme } from './theme'
import { ThemeProvider } from './theme-provider'

describe('cssVariablesResolver', () => {
  it('maps Mantine scheme variables onto the design tokens in both schemes', () => {
    const vars = cssVariablesResolver(theme as never)
    for (const scheme of ['light', 'dark'] as const) {
      expect(vars[scheme]['--mantine-color-body']).toBe('var(--bg)')
      expect(vars[scheme]['--mantine-color-text']).toBe('var(--ink)')
      expect(vars[scheme]['--mantine-color-default-border']).toBe('var(--border-strong)')
    }
  })
})

describe('ThemeProvider', () => {
  it('renders children and emits the token-mapped variables', () => {
    render(
      <ThemeProvider>
        <p>child</p>
      </ThemeProvider>,
    )
    expect(screen.getByText('child')).toBeInTheDocument()
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toContain('--mantine-color-body: var(--bg)')
  })
})
