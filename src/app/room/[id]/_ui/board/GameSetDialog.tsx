'use client'
/**
 * STUB (Foundation). Final props contract for T2 `table`, which owns and replaces this file.
 */

export type GameSetDialogProps = {
  opened: boolean
  winner: string | null
  standings: { name: string; handCount: number }[]
  /** number of plays this round */
  plays?: number
  onNextRound: () => void
  canStart?: boolean
}

export function GameSetDialog({
  opened,
  winner,
  onNextRound,
  canStart = true,
}: GameSetDialogProps) {
  if (!opened) {
    return null
  }
  return (
    <dialog open={true} aria-label="GAME SET" data-stub="GameSetDialog">
      <p>Theorem. {winner} の勝ち。 ∎</p>
      <button type="button" disabled={!canStart} onClick={onNextRound}>
        次のラウンドを開始
      </button>
    </dialog>
  )
}
