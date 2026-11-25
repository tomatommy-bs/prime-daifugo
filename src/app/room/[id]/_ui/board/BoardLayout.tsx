'use client'
/**
 * The board grid (§7.5–§7.6). One CSS grid per layout mode, with named areas:
 *
 * compact (844×390, 384px budget):
 *   columns 72px / 1fr / 168px, rows 36 / 132 / 76 / 128 (4px row gaps)
 *   "top top top" "deck field rail" "reset tray rail" "hand hand hand"
 *   factor mode swaps the middle rows to 76 / 132 so the tray grows into the FactorPanel.
 * regular: the compact grid with larger clamps; the log is a Drawer (rendered by the caller).
 * portrait: "top" "deck field" "tray" "hand" "rail" with a 55px bottom action row.
 * wide: columns 1fr / 320px, rows 52px / 1fr / auto / auto,
 *   "top log" "table log" "tray log" "hand log" (the deck sits on the table, actions by the tray).
 *
 * The factor-mode row morph is a CSS `grid-template-rows` transition on `--t-lg`, which the
 * global reduced-motion rule collapses to 0.01 ms.
 */
import { useMotionMode } from '@/design/motion'
import type { CSSProperties, ReactNode } from 'react'
import { SeatLine } from './SeatLine'
import type { LayoutMode, SeatModel } from './types'

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
  /** optional content for the compact `reset` cell; without it the tray spans it */
  reset?: ReactNode
}

type Grid = {
  columns: string
  rows: string
  factorRows?: string
  areas: string[]
  columnGap: string
  rowGap: string
}

/** Grid templates per mode, exported for tests and the design gallery. */
export const GRID: Record<LayoutMode, Grid> = {
  compact: {
    columns: '72px minmax(0, 1fr) 168px',
    rows: '36px 132px 76px 128px',
    // spec: 76 / 132; the field keeps only its value and mini cards (44px) so the tray row
    // can hold the condensed tray plus the two-row FactorPanel (still 384 ≤ 390).
    factorRows: '36px 64px 144px 128px',
    areas: ['top top top', 'deck field rail', 'reset tray rail', 'hand hand hand'],
    columnGap: 'var(--sp-3)',
    rowGap: 'var(--sp-1)',
  },
  regular: {
    columns: '96px minmax(0, 1fr) 200px',
    rows: '44px minmax(168px, 1fr) minmax(104px, auto) minmax(176px, auto)',
    factorRows: '44px minmax(104px, auto) minmax(168px, 1fr) minmax(176px, auto)',
    areas: ['top top top', 'deck field rail', 'reset tray rail', 'hand hand hand'],
    columnGap: 'var(--sp-4)',
    rowGap: 'var(--sp-2)',
  },
  portrait: {
    columns: '72px minmax(0, 1fr)',
    rows: '36px minmax(132px, 1fr) auto auto 55px',
    factorRows: '36px minmax(96px, auto) minmax(132px, 1fr) auto 55px',
    areas: ['top top', 'deck field', 'tray tray', 'hand hand', 'rail rail'],
    columnGap: 'var(--sp-3)',
    rowGap: 'var(--sp-2)',
  },
  wide: {
    columns: 'minmax(0, 1fr)',
    rows: '52px minmax(0, 1fr) auto auto',
    areas: ['top', 'table', 'tray', 'hand'],
    columnGap: 'var(--sp-4)',
    rowGap: 'var(--sp-3)',
  },
}

const WIDE_LOG_COLUMN = '320px'

export function gridStyle(mode: LayoutMode, factorOpen: boolean, withLog: boolean): CSSProperties {
  const g = GRID[mode]
  let columns = g.columns
  let areas = g.areas
  if (mode === 'wide' && withLog) {
    columns = `${g.columns} ${WIDE_LOG_COLUMN}`
    areas = areas.map((row) => `${row} log`)
  }
  return {
    display: 'grid',
    gridTemplateColumns: columns,
    gridTemplateRows: factorOpen && g.factorRows ? g.factorRows : g.rows,
    gridTemplateAreas: areas.map((row) => `"${row}"`).join(' '),
    columnGap: g.columnGap,
    rowGap: g.rowGap,
    transition: 'grid-template-rows var(--t-lg) var(--ease-out)',
  }
}

const area = (name: string): CSSProperties => ({ gridArea: name, minWidth: 0, minHeight: 0 })

/** Card-size overrides while the factor panel is open on a phone (compact rows are fixed). */
function factorVars(mode: LayoutMode, factorOpen: boolean): CSSProperties {
  if (!factorOpen || mode !== 'compact') {
    return {}
  }
  return {
    '--card-field': 'calc(44px * var(--card-k))',
    '--card-tray': 'calc(38px * var(--card-k))',
  } as CSSProperties
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
  reset,
}: BoardLayoutProps) {
  const motion = useMotionMode()
  const withLog = mode === 'wide' && log !== undefined && log !== null
  const shell = {
    'data-board-layout': mode,
    'data-factor': factorOpen ? 'true' : 'false',
    'data-motion': motion,
    className:
      'relative mx-auto h-full w-full px-[max(var(--sp-3),env(safe-area-inset-left),env(safe-area-inset-right))]',
    style: { ...gridStyle(mode, factorOpen, withLog), ...factorVars(mode, factorOpen) },
  }

  if (mode === 'wide') {
    return (
      <div {...shell}>
        <div style={area('top')} data-area="top" className="flex items-center">
          {top}
        </div>
        <div style={area('table')} data-area="table" className="relative flex items-stretch">
          <div className="relative min-w-0 flex-1">{field}</div>
          {/* a real column (not an overlay), so the measured SeatRing never runs under the pile */}
          <div data-area="deck" className="flex shrink-0 items-center pr-fib-3">
            {deck}
          </div>
        </div>
        <div style={area('tray')} data-area="tray" className="flex items-center gap-fib-4">
          <div className="min-w-0 flex-1">{tray}</div>
          <div data-area="rail" className="shrink-0">
            {actions}
          </div>
        </div>
        <div style={area('hand')} data-area="hand" className="pb-fib-3">
          {hand}
        </div>
        {withLog ? (
          <aside
            style={{ gridArea: 'log', minHeight: 0 }}
            data-area="log"
            className="border-l border-line"
          >
            {log}
          </aside>
        ) : null}
      </div>
    )
  }

  const hasReset = reset !== undefined && reset !== null && mode !== 'portrait'
  return (
    <div {...shell}>
      <div style={area('top')} data-area="top" className="flex items-center">
        {top}
      </div>
      <div style={area('deck')} data-area="deck" className="flex items-center justify-center">
        {deck}
      </div>
      <div
        style={area('field')}
        data-area="field"
        className="relative flex flex-col justify-center"
      >
        {field}
      </div>
      {hasReset ? (
        <div style={area('reset')} data-area="reset" className="flex items-center justify-center">
          {reset}
        </div>
      ) : null}
      <div
        style={
          hasReset || mode === 'portrait'
            ? area('tray')
            : { gridColumn: '1 / 3', gridRow: '3', minWidth: 0, minHeight: 0 }
        }
        data-area="tray"
        className="relative"
      >
        {tray}
      </div>
      <div style={area('rail')} data-area="rail">
        {actions}
      </div>
      <div style={area('hand')} data-area="hand" className="relative">
        {hand}
      </div>
      {log ?? null}
    </div>
  )
}

export type BoardTopBarProps = {
  mode: LayoutMode
  seats: SeatModel[]
  /** players in the residue ring */
  n: number
  /** the TurnTimer (or any trailing status) */
  timer: ReactNode
  isMyTurn: boolean
  /** leave room on the right for the collapsed room menu (∴ ⋯ ☰) */
  reserveRight?: boolean
}

/**
 * The 36px top bar: the SeatLine and the timer (§7.5). In `wide` the seats live on the
 * SeatRing, so the bar is a one-line status: `ℤ/nℤ · bob の番 ◔`.
 */
export function BoardTopBar({ mode, seats, n, timer, isMyTurn, reserveRight }: BoardTopBarProps) {
  // The active seat already draws the clock (SeatLine end / SeatRing node): show the
  // bar's own timer only when no seat does, so there is never a second clock.
  const seatClock =
    mode === 'wide'
      ? seats.some((s) => s.isActive && !s.observer && s.timeLimit !== undefined)
      : seats.some((s) => !s.observer && s.timeLimit !== undefined)
  const ownTimer = seatClock ? null : timer
  if (mode === 'wide') {
    const active = seats.find((s) => s.isActive && !s.observer)
    let turn = '—'
    if (isMyTurn) {
      turn = 'あなたの番です'
    } else if (active) {
      turn = `${active.name} の番`
    }
    return (
      <div className="flex w-full items-center gap-fib-3 text-ink-muted" data-top-bar="status">
        {/* ℤ/nℤ already heads the RoomHeader above this bar in wide */}
        <span className="sr-only">ℤ/{n}ℤ</span>
        <span className={isMyTurn ? 'font-semibold text-ink' : ''}>{turn}</span>
        {ownTimer}
      </div>
    )
  }
  return (
    <div
      data-top-bar="seats"
      className="flex h-full w-full min-w-0 items-center gap-fib-2"
      style={reserveRight ? { paddingRight: 140 } : undefined}
    >
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        <SeatLine seats={seats} n={n} />
      </div>
      {ownTimer ? <div className="shrink-0">{ownTimer}</div> : null}
    </div>
  )
}
