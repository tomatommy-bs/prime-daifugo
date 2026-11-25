'use client'
/**
 * STUB (Foundation). Final props contract for T3 `board`, which owns and replaces this file.
 */
import type { DrawDisabledReason } from './types'

export type ActionBarProps = {
  canDraw: boolean
  drawReason: DrawDisabledReason | null
  canPass: boolean
  canSubmit: boolean
  factorMode: boolean
  factorDisabled: boolean
  isMyTurn: boolean
  onDraw: () => void
  onPass: () => void
  onSubmit: () => void
  onToggleFactor: () => void
  orientation: 'rail' | 'row' | 'bottom'
  /** keyboard hints (pointer: fine only) */
  showKbd?: boolean
}

export function ActionBar(props: ActionBarProps) {
  return (
    <fieldset data-stub="ActionBar" data-orientation={props.orientation}>
      <legend className="sr-only">操作</legend>
      <button type="button" disabled={!props.canDraw} onClick={props.onDraw}>
        引く
      </button>
      <button type="button" disabled={!props.canPass} onClick={props.onPass}>
        パス
      </button>
      <button
        type="button"
        disabled={props.factorDisabled}
        aria-pressed={props.factorMode}
        onClick={props.onToggleFactor}
      >
        素因数分解
      </button>
      <button type="button" disabled={!props.canSubmit} onClick={props.onSubmit}>
        出す
      </button>
    </fieldset>
  )
}
