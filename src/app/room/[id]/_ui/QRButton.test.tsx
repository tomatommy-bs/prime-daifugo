import { renderWithProviders } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QRButton } from './QRButton'

const URL = 'https://example.test/room/42'

describe('QRButton', () => {
  it('opens a popover with the QR, the URL and a copy button', async () => {
    renderWithProviders(<QRButton url={URL} />)
    fireEvent.click(screen.getByRole('button', { name: '招待用QRコード' }))
    expect(await screen.findByRole('textbox', { name: '招待URL' })).toHaveValue(URL)
    expect(await screen.findByRole('button', { name: 'URLをコピー' })).toBeInTheDocument()
    expect(document.querySelector('svg')).not.toBeNull()
  })

  it('honours popoverProps.defaultOpened', async () => {
    renderWithProviders(<QRButton url={URL} popoverProps={{ defaultOpened: true }} />)
    expect(await screen.findByRole('textbox', { name: '招待URL' })).toBeInTheDocument()
    expect(document.querySelector('[data-pulse]')).toBeNull()
  })

  it('pulses once when it starts closed', () => {
    renderWithProviders(<QRButton url={URL} popoverProps={{ defaultOpened: false }} />)
    expect(document.querySelector('[data-pulse]')).not.toBeNull()
  })

  it('does not pulse under reduced motion', () => {
    renderWithProviders(<QRButton url={URL} />, { reducedMotion: true })
    expect(document.querySelector('[data-pulse]')).toBeNull()
  })
})
