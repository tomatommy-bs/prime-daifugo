'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */
import type { SubmitResultView } from './types'

export type ResultOverlayProps = {
  result: SubmitResultView | null
  onDone?: () => void
}

export function ResultOverlay({ result }: ResultOverlayProps) {
  if (!result) {
    return null
  }
  return (
    <output data-stub="ResultOverlay" data-kind={result.kind}>
      {result.submitter} {result.value}
      {result.penalty > 0 ? ` +${result.penalty}` : null}
    </output>
  )
}
