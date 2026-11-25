'use client'
/**
 * STUB (Foundation). Final props contract for T3 `board`, which owns and replaces this file.
 */

export type LiveRegionProps = {
  message: string | null
}

export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <output className="sr-only" data-stub="LiveRegion">
      {message ?? ''}
    </output>
  )
}
