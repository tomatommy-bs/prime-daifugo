'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */

export type GrothendieckCutProps = {
  active: boolean
  onDone: () => void
  /** tap / Esc skips the ceremony, default true */
  skippable?: boolean
}

export function GrothendieckCut({ active, onDone }: GrothendieckCutProps) {
  if (!active) {
    return null
  }
  return (
    <button type="button" data-stub="GrothendieckCut" onClick={onDone}>
      57 — グロタンディーク素数切り
    </button>
  )
}
