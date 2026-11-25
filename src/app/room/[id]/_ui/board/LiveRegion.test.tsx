import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveRegion } from './LiveRegion'

describe('LiveRegion', () => {
  it('is a polite, atomic, visually hidden status', () => {
    render(<LiveRegion message="あなたの番です" />)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('あなたの番です')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('aria-atomic', 'true')
    expect(region).toHaveClass('sr-only')
  })

  it('renders nothing for null and updates with new messages', () => {
    const { rerender } = render(<LiveRegion message={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('')
    rerender(<LiveRegion message="残り5秒" />)
    expect(screen.getByRole('status')).toHaveTextContent('残り5秒')
  })
})
