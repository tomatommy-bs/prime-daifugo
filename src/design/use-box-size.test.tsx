import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBoxSize } from './use-box-size'

type Callback = (entries: { contentRect: { width: number; height: number } }[]) => void
const observers: { cb: Callback; disconnect: ReturnType<typeof vi.fn> }[] = []

class FakeResizeObserver {
  cb: Callback
  disconnect = vi.fn()
  constructor(cb: Callback) {
    this.cb = cb
    observers.push(this)
  }
  observe() {}
  unobserve() {}
}

function Probe() {
  const [show, setShow] = useState(false)
  const { ref, width, height } = useBoxSize()
  return (
    <>
      <button type="button" onClick={() => setShow((v) => !v)}>
        toggle
      </button>
      <output>{`${width}x${height}`}</output>
      {show ? <div ref={ref} /> : null}
    </>
  )
}

describe('useBoxSize', () => {
  afterEach(() => {
    observers.length = 0
    vi.unstubAllGlobals()
  })

  it('starts at 0×0 and follows an element that mounts later', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    render(<Probe />)
    expect(screen.getByRole('status')).toHaveTextContent('0x0')
    act(() => screen.getByText('toggle').click())
    expect(observers).toHaveLength(1)
    act(() => observers[0].cb([{ contentRect: { width: 960.4, height: 398 } }]))
    expect(screen.getByRole('status')).toHaveTextContent('960x398')
    // unmounting the element disconnects its observer
    act(() => screen.getByText('toggle').click())
    expect(observers[0].disconnect).toHaveBeenCalled()
  })

  it('works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Probe />)
    act(() => screen.getByText('toggle').click())
    expect(screen.getByRole('status')).toHaveTextContent('0x0')
  })
})
