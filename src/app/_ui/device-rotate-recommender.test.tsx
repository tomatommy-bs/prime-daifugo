import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeviceRotateRecommender from './device-rotate-recommender'

const rotate = vi.hoisted(() => ({ shouldRotate: true }))
vi.mock('@/hooks/use-should-rotate', () => ({
  useShouldRotate: () => ({ shouldRotate: rotate.shouldRotate, canRotate: true }),
}))

const nav = vi.hoisted(() => ({ pathname: '/' as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

const KEY = 'shouldShowRotateRecommender'
const DIALOG = { name: '画面の向き' }

describe('DeviceRotateRecommender', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    rotate.shouldRotate = true
    nav.pathname = '/'
  })

  it.each(['/rules', '/labo/calc', '/training', '/training/factor'])(
    'stays hidden on %s, which works in portrait',
    (path) => {
      nav.pathname = path
      renderWithProviders(<DeviceRotateRecommender />)
      expect(screen.queryByRole('region', DIALOG)).not.toBeInTheDocument()
    },
  )

  it('shows the Japanese banner when the device should rotate', async () => {
    renderWithProviders(<DeviceRotateRecommender />)
    expect(await screen.findByRole('region', DIALOG)).toBeInTheDocument()
    expect(screen.getByText('横向きにしてプレイ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('renders nothing when the device need not rotate', () => {
    rotate.shouldRotate = false
    renderWithProviders(<DeviceRotateRecommender />)
    expect(screen.queryByRole('region', DIALOG)).not.toBeInTheDocument()
  })

  it('honours sessionStorage shouldShowRotateRecommender=false', async () => {
    window.sessionStorage.setItem(KEY, 'false')
    renderWithProviders(<DeviceRotateRecommender />)
    await waitFor(() => expect(screen.queryByRole('region', DIALOG)).not.toBeInTheDocument())
  })

  it('closing without the checkbox hides it but keeps the key', async () => {
    renderWithProviders(<DeviceRotateRecommender />)
    fireEvent.click(await screen.findByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('region', DIALOG)).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(KEY)).not.toBe('false')
  })

  it('closing with the checkbox stores false for the session', async () => {
    renderWithProviders(<DeviceRotateRecommender />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /再度ページを開くまで表示しない/ }))
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('region', DIALOG)).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(KEY)).toBe('false')
  })
})
