import { renderWithProviders } from '@/test-utils'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Layout from './layout'

describe('/labo/calc layout', () => {
  it('explains the tool and links into the rules', () => {
    renderWithProviders(
      <Layout>
        <div />
      </Layout>,
    )
    expect(screen.getByRole('heading', { level: 2, name: '素数判定ラボの使い方' })).toBeVisible()
    expect(screen.getByText('A').nextSibling).toHaveTextContent('= 1')
    expect(screen.getByRole('link', { name: 'カードと数のつくり方' })).toHaveAttribute(
      'href',
      '/rules#cards',
    )
    expect(screen.getByRole('link', { name: '合成数出し（素因数分解）' })).toHaveAttribute(
      'href',
      '/rules#factor',
    )
    expect(screen.getByRole('link', { name: '素数大富豪のルールと遊び方' })).toHaveAttribute(
      'href',
      '/rules',
    )
  })

  it('publishes a ホーム > 素数判定ラボ breadcrumb', () => {
    const { container } = renderWithProviders(
      <Layout>
        <div />
      </Layout>,
    )
    const script = container.querySelector('script[type="application/ld+json"]')
    const data = JSON.parse(script?.textContent ?? '{}')
    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      'ホーム',
      '素数判定ラボ',
    ])
  })
})
