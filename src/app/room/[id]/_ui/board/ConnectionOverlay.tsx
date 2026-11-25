'use client'
/**
 * STUB (Foundation). Final props contract for T3 `board`, which owns and replaces this file.
 */
import type { ReactNode } from 'react'
import type { ConnectionState } from './types'

export type ConnectionOverlayProps = {
  state: ConnectionState
  onReconnect?: () => void
  children: ReactNode
}

export function ConnectionOverlay({ state, onReconnect, children }: ConnectionOverlayProps) {
  return (
    <div data-stub="ConnectionOverlay" data-state={state}>
      {children}
      {state === 'connecting' ? <output>接続中…</output> : null}
      {state === 'waiting-sync' ? <output>次のイベントを待っています…</output> : null}
      {state === 'closed' || state === 'error' ? (
        <div role="alert">
          接続が切れました
          <button type="button" onClick={onReconnect}>
            再接続
          </button>
        </div>
      ) : null}
    </div>
  )
}
