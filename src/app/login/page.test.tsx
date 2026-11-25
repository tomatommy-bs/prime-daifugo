import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'

const cookies = vi.hoisted(() => ({
  get: vi.fn<(key: string) => string | undefined>(() => undefined),
  set: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('js-cookie', () => ({ default: cookies }))

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}))

const fakeLocation = { pathname: '/login' }

const nameInput = () => screen.getByRole('textbox', { name: '名前' })
const submitButton = () => screen.getByRole('button', { name: /はじめる/ })

describe('Login page', () => {
  beforeEach(() => {
    cookies.get.mockReturnValue(undefined)
    cookies.set.mockClear()
    nav.params = new URLSearchParams()
    nav.push.mockClear()
    fakeLocation.pathname = '/login'
    vi.stubGlobal('location', fakeLocation)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the Japanese copy and an empty meter', () => {
    renderWithProviders(<Page />)
    expect(screen.getByRole('heading', { name: /素数大富豪/ })).toBeInTheDocument()
    expect(screen.getByText('名前を入力してください')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0')
    expect(submitButton()).toBeDisabled()
  })

  it('prefills the name from the cookie', () => {
    cookies.get.mockReturnValue('alice')
    renderWithProviders(<Page />)
    expect(nameInput()).toHaveValue('alice')
    expect(cookies.get).toHaveBeenCalledWith('name')
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '5')
    expect(submitButton()).toBeEnabled()
  })

  it('tracks the meter and disables the button when the name is invalid', () => {
    renderWithProviders(<Page />)
    fireEvent.change(nameInput(), { target: { value: 'ab' } })
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'short')
    expect(submitButton()).toBeDisabled()

    fireEvent.change(nameInput(), { target: { value: 'abc' } })
    expect(submitButton()).toBeEnabled()

    fireEvent.change(nameInput(), { target: { value: 'abcdefghijk' } })
    expect(screen.getByRole('meter')).toHaveAttribute('data-state', 'long')
    expect(submitButton()).toBeDisabled()
  })

  it('clears the input with the close button', () => {
    cookies.get.mockReturnValue('alice')
    renderWithProviders(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))
    expect(nameInput()).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'クリア' })).not.toBeInTheDocument()
  })

  it('sets the cookie for 365 days and assigns location.pathname to the callback', () => {
    nav.params = new URLSearchParams({ callback: '/room/1234' })
    renderWithProviders(<Page />)
    fireEvent.change(nameInput(), { target: { value: 'alice' } })
    fireEvent.click(submitButton())
    expect(cookies.set).toHaveBeenCalledWith('name', 'alice', { expires: 365 })
    expect(fakeLocation.pathname).toBe('/room/1234')
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('pushes / when there is no callback', () => {
    renderWithProviders(<Page />)
    fireEvent.change(nameInput(), { target: { value: 'alice' } })
    fireEvent.click(submitButton())
    expect(cookies.set).toHaveBeenCalledWith('name', 'alice', { expires: 365 })
    expect(nav.push).toHaveBeenCalledWith('/')
    expect(fakeLocation.pathname).toBe('/login')
  })

  it('submits on Enter', () => {
    nav.params = new URLSearchParams({ callback: '/room/42' })
    renderWithProviders(<Page />)
    fireEvent.change(nameInput(), { target: { value: 'bobby' } })
    fireEvent.submit(nameInput().closest('form') as HTMLFormElement)
    expect(cookies.set).toHaveBeenCalledWith('name', 'bobby', { expires: 365 })
    expect(fakeLocation.pathname).toBe('/room/42')
  })

  it('ignores Enter while the name is invalid', () => {
    renderWithProviders(<Page />)
    fireEvent.change(nameInput(), { target: { value: 'x' } })
    fireEvent.submit(nameInput().closest('form') as HTMLFormElement)
    expect(cookies.set).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })
})
