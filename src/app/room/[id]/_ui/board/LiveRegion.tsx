'use client'
/**
 * Screen-reader announcements (§6.4, §9.4): あなたの番です, results, penalties, the winner
 * and 残り5秒. Visually hidden; information is never motion-only. To announce the same
 * text twice, the caller changes the message (e.g. `announce()` in the board container
 * appends an alternating zero-width marker).
 */

export type LiveRegionProps = {
  message: string | null
}

export function LiveRegion({ message }: LiveRegionProps) {
  return (
    // <output> carries the implicit `role="status"`
    <output aria-live="polite" aria-atomic="true" className="sr-only" data-live-region="">
      {message ?? ''}
    </output>
  )
}
