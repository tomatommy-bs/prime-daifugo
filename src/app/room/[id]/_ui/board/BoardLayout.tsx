'use client'
/**
 * STUB (Foundation). Final props contract for T3 `board`, which owns and replaces this file.
 */
import type { ReactNode } from 'react'
import type { LayoutMode } from './types'

export type BoardLayoutProps = {
  mode: LayoutMode
  top: ReactNode
  deck: ReactNode
  field: ReactNode
  tray: ReactNode
  actions: ReactNode
  hand: ReactNode
  log?: ReactNode
  factorOpen?: boolean
}

export function BoardLayout({
  mode,
  top,
  deck,
  field,
  tray,
  actions,
  hand,
  log,
  factorOpen = false,
}: BoardLayoutProps) {
  return (
    <div data-stub="BoardLayout" data-mode={mode} data-factor={factorOpen}>
      <div>{top}</div>
      <div>{deck}</div>
      <div>{field}</div>
      <div>{tray}</div>
      <div>{actions}</div>
      <div>{hand}</div>
      {log ? <aside>{log}</aside> : null}
    </div>
  )
}
