import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NotFound from './not-found'

describe('404 page', () => {
  it('says the page was not found and links home and to the rules', () => {
    renderWithProviders(<NotFound />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ページが見つかりません')
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'ルールを読む' })).toHaveAttribute('href', '/rules')
  })
})
