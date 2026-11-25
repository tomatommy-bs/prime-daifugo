import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoomNewError from './error'

describe('/room/new error', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the caption as an alert', () => {
    renderWithProviders(<RoomNewError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /部屋を作れませんでした/ })).toBeInTheDocument()
  })

  it('links retry to /room/new and home to /', () => {
    renderWithProviders(<RoomNewError error={new Error('boom')} />)
    expect(screen.getByRole('link', { name: /もう一度/ })).toHaveAttribute('href', '/room/new')
    expect(screen.getByRole('link', { name: /ホームへ/ })).toHaveAttribute('href', '/')
  })
})
