'use client'
/**
 * STUB (Foundation). Final props contract for T3 `board`, which owns and replaces this file.
 */
import type { LogEntry } from './types'

export type ProofLogProps = {
  /** newest first */
  entries: LogEntry[]
  variant: 'sidebar' | 'drawer'
  opened?: boolean
  onClose?: () => void
}

export function ProofLog({ entries, variant, opened = true }: ProofLogProps) {
  if (variant === 'drawer' && !opened) {
    return null
  }
  return (
    <section aria-label="証明ログ" data-stub="ProofLog" data-variant={variant}>
      <ol aria-live="polite">
        {entries.map((e) => (
          <li key={e.id} data-kind={e.kind}>
            {e.node}
          </li>
        ))}
      </ol>
    </section>
  )
}
