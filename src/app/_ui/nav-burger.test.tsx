import { theme } from '@/design/theme'
import { renderWithProviders } from '@/test-utils'
import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NAV_BURGER_Z_INDEX, NavBurger } from './nav-burger'

const device = vi.hoisted(() => ({
  canFullscreen: true,
  toggleFullscreen: vi.fn(),
}))
vi.mock('@/hooks/use-should-device', () => ({
  useShouldDevice: () => ({
    canRotate: true,
    canFullscreen: device.canFullscreen,
    shouldRotate: false,
    shouldFullscreen: true,
    toggleFullscreen: device.toggleFullscreen,
    perfect: false,
  }),
}))

const setFullscreenElement = (el: Element | null) => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el,
  })
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'))
  })
}

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
  // the dropdown items become accessible once the open transition has run
  return screen.findAllByRole('menuitem')
}

describe('NavBurger', () => {
  beforeEach(() => {
    device.canFullscreen = true
    device.toggleFullscreen.mockClear()
    setFullscreenElement(null)
  })
  afterEach(() => {
    setFullscreenElement(null)
  })

  it('is affixed by default, below modals', () => {
    renderWithProviders(<NavBurger />)
    const affix = document.querySelector<HTMLElement>('[data-placement="affix"]')
    expect(affix).toBeInTheDocument()
    expect(NAV_BURGER_Z_INDEX).toBeLessThan(200)
    expect(affix?.getAttribute('style')).toContain(`--affix-z-index: ${NAV_BURGER_Z_INDEX}`)
    expect(affix?.getAttribute('style')).toContain('--affix-top: max(var(--sp-3)')
    expect(affix?.getAttribute('style')).toContain('--affix-right: max(var(--sp-3)')
  })

  it('renders in place with placement="inline"', () => {
    const { container } = renderWithProviders(<NavBurger placement="inline" />)
    expect(container.querySelector('[data-placement="inline"]')).toBeInTheDocument()
    expect(document.querySelector('[data-placement="affix"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'メニューを開く' })).toBeInTheDocument()
  })

  it('links home', async () => {
    renderWithProviders(<NavBurger placement="inline" />)
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /ホーム/ })).toHaveAttribute('href', '/')
  })

  it('shows the maximize icon to enter fullscreen when not fullscreen', async () => {
    renderWithProviders(<NavBurger placement="inline" />)
    await openMenu()
    const item = screen.getByRole('menuitem', { name: /全画面/ })
    expect(item).toHaveTextContent('全画面')
    expect(item).toHaveAttribute('data-fullscreen', 'off')
    expect(item.querySelector('.tabler-icon-maximize')).toBeInTheDocument()
    expect(item.querySelector('.tabler-icon-minimize')).not.toBeInTheDocument()
    fireEvent.click(item)
    expect(device.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('shows the minimize icon to leave fullscreen when fullscreen', async () => {
    renderWithProviders(<NavBurger placement="inline" />)
    setFullscreenElement(document.documentElement)
    await openMenu()
    const item = screen.getByRole('menuitem', { name: /全画面を終了/ })
    expect(item).toHaveAttribute('data-fullscreen', 'on')
    expect(item.querySelector('.tabler-icon-minimize')).toBeInTheDocument()
    expect(item.querySelector('.tabler-icon-maximize')).not.toBeInTheDocument()
  })

  it('hides the fullscreen item when fullscreen is unavailable', async () => {
    device.canFullscreen = false
    renderWithProviders(<NavBurger placement="inline" />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /全画面/ })).not.toBeInTheDocument()
  })

  it('toggles the colour scheme', async () => {
    render(
      <MantineProvider theme={theme} defaultColorScheme="light">
        <NavBurger placement="inline" />
      </MantineProvider>,
    )
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /ダークモード/ }))
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark'),
    )
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: /ライトモード/ })).toBeInTheDocument()
  })
})
