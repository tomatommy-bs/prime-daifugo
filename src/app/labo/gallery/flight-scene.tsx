'use client'
/**
 * `?scene=flights[&play=<step>]`: a live board that replays one server transition through
 * the same pipeline as `GameBoard` — `classifyTransition` → director + `planFlights` →
 * `FlightLayer` — so card flights (draw, play, penalty, flow, the 57 cut, deal) can be seen
 * and captured frame by frame. Each step starts from its own state; the transition fires
 * `FLIGHT_SCENE_DELAY_MS` after mount (or on a step button). `data-flight-phase` and
 * `data-flight-at` (performance.now() of the transition) tell capture scripts when it fired.
 */
import {
  ActionBar,
  BoardLayout,
  DeckPile,
  FieldStack,
  FlightLayer,
  type FlightLayerHandle,
  GrothendieckCut,
  Hand,
  type LayoutMode,
  ResultOverlay,
  SeatLine,
  SeatRing,
  SubmitTray,
  buildSeats,
  planFlights,
} from '@/app/room/[id]/_ui/board'
import {
  type BoardMemo,
  EMPTY_MEMO,
  type GameState,
  classifyTransition,
  freshCards,
  reduceMemo,
  resultViewOf,
} from '@/app/room/[id]/_ui/board/classify-transition'
import { useBoardDirector } from '@/app/room/[id]/_ui/board/use-board-director'
import { useReducedMotionSafe } from '@/design/motion'
import { useBoxSize } from '@/design/use-box-size'
import { useLayoutMode } from '@/design/use-layout-mode'
import type { CardId } from '@/game-card/src'
import { compareCard } from '@/utils/play-card'
import { LayoutGroup } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  FLIGHT_PRESENCE,
  FLIGHT_STEPS,
  FLIGHT_STEP_IDS,
  FLIGHT_STEP_TITLES,
  type FlightStepId,
} from './flight-script'

/** Time between mount and the transition, so the "before" frame settles. */
export const FLIGHT_SCENE_DELAY_MS = 900

const noop = () => undefined
const sorted = (cards: CardId[]) => [...cards].sort(compareCard)

const ACTION_ORIENTATION: Record<LayoutMode, 'rail' | 'row' | 'bottom'> = {
  compact: 'rail',
  regular: 'rail',
  portrait: 'bottom',
  wide: 'row',
}

function useStep(stepId: FlightStepId, run: number) {
  const step = FLIGHT_STEPS[stepId]
  const selfId = step.selfId
  const [gs, setGs] = useState<GameState>(step.before)
  const [hand, setHand] = useState<CardId[]>(() =>
    without(sorted(step.before.gameState.players[selfId]?.hand ?? []), step.tray),
  )
  const [tray, setTray] = useState<CardId[]>(step.tray)
  const [memo, setMemo] = useState<BoardMemo>(EMPTY_MEMO)
  const [freshIds, setFreshIds] = useState<CardId[]>([])
  const [phase, setPhase] = useState<'before' | 'after'>('before')
  const [firedAt, setFiredAt] = useState<number | null>(null)
  const director = useBoardDirector({ reduced: useReducedMotionSafe() })
  const flights = useRef<FlightLayerHandle>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: one transition per (step, run)
  useEffect(() => {
    const id = setTimeout(() => {
      const prev = step.before
      const next = step.next
      const events = classifyTransition(prev, next, step.msg, selfId)
      // the same order as GameBoard: measure on the old DOM, then apply the state
      flights.current?.launch(planFlights(events, { selfId, prev, next }))
      for (const e of events) {
        e.type === 'end' ? director.holdEnd(e) : director.push(e)
      }
      setMemo((m) => events.reduce(reduceMemo, m))
      setFreshIds(freshCards(prev, next, events, selfId) ?? [])
      setGs(next)
      setHand(sorted(next.gameState.players[selfId]?.hand ?? []))
      setTray([])
      setPhase('after')
      setFiredAt(Math.round(performance.now()))
    }, FLIGHT_SCENE_DELAY_MS)
    return () => clearTimeout(id)
  }, [stepId, run])

  return { step, gs, hand, tray, memo, freshIds, phase, firedAt, director, flights }
}

const without = (hand: CardId[], cards: CardId[]) => hand.filter((c) => !cards.includes(c))

function StepBoard({ stepId, run }: { stepId: FlightStepId; run: number }) {
  const layoutMode = useLayoutMode()
  const table = useBoxSize()
  const { step, gs, hand, tray, memo, freshIds, phase, firedAt, director, flights } = useStep(
    stepId,
    run,
  )
  const { gameState, ctx } = gs
  const selfId = step.selfId
  const current = director.current
  const seats = buildSeats({
    gameState,
    ctx,
    presence: FLIGHT_PRESENCE,
    selfId,
    passedIds: memo.passedIds,
    leftTime: 42,
    penalties: current?.type === 'submit-fail' ? { [current.playerId]: current.penalty } : {},
  })
  const players = seats.filter((s) => !s.observer)
  const n = Math.max(1, players.length)
  const isMyTurn = ctx.currentPlayer === selfId
  const fieldTop = gameState.field.at(-1) ?? null
  const nameOf = (id: string) => FLIGHT_PRESENCE.find((p) => p.id === id)?.name ?? id
  const submitter = current && 'playerId' in current ? nameOf(current.playerId) : ''

  const fieldStack = (
    <FieldStack
      field={gameState.field}
      leadName={players.find((s) => s.isLead)?.name ?? null}
      flightHandoff={true}
      resultOverlay={
        <>
          <ResultOverlay result={resultViewOf(current, submitter)} onDone={director.done} />
          <GrothendieckCut
            active={current?.type === 'cut57'}
            onDone={director.done}
            cards={current?.type === 'cut57' ? current.cards : undefined}
          />
        </>
      }
    />
  )

  return (
    <div
      className="h-full"
      data-card-size="M"
      data-flight-step={stepId}
      data-flight-phase={phase}
      data-flight-at={firedAt ?? undefined}
      data-director={current?.type ?? 'idle'}
    >
      <LayoutGroup id="board">
        <BoardLayout
          mode={layoutMode}
          top={
            layoutMode === 'wide' ? (
              <div className="h-full" />
            ) : (
              <div className="flex h-full min-w-0 items-center pr-[calc(var(--sp-6)+var(--sp-2))]">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <SeatLine seats={seats} n={n} />
                </div>
              </div>
            )
          }
          deck={
            <DeckPile
              count={gameState.deck.length}
              canDraw={isMyTurn}
              onDraw={layoutMode === 'wide' ? noop : undefined}
              compact={layoutMode !== 'wide'}
            />
          }
          field={
            layoutMode === 'wide' ? (
              <div ref={table.ref} className="h-full min-h-0 w-full">
                <SeatRing seats={seats} width={table.width || 960} height={table.height || 520}>
                  {fieldStack}
                </SeatRing>
              </div>
            ) : (
              fieldStack
            )
          }
          tray={<SubmitTray cardIds={tray} fieldTop={fieldTop} onRemove={noop} onReset={noop} />}
          actions={
            <ActionBar
              canDraw={isMyTurn}
              drawReason={isMyTurn ? null : 'not-your-turn'}
              canPass={isMyTurn}
              canSubmit={isMyTurn && tray.length > 0}
              factorMode={false}
              factorDisabled={true}
              isMyTurn={isMyTurn}
              onDraw={noop}
              onPass={noop}
              onSubmit={noop}
              onToggleFactor={noop}
              orientation={ACTION_ORIENTATION[layoutMode]}
            />
          }
          hand={
            <Hand
              cardIds={hand}
              isMyTurn={isMyTurn}
              mode="basic"
              freshIds={freshIds}
              layout={layoutMode === 'portrait' ? 'wrap' : 'auto'}
              onSelect={noop}
            />
          }
        />
      </LayoutGroup>
      <FlightLayer ref={flights} />
    </div>
  )
}

export function FlightScene({ initial }: { initial: FlightStepId }) {
  const [stepId, setStepId] = useState<FlightStepId>(initial)
  const [run, setRun] = useState(0)
  const play = (id: FlightStepId) => {
    setStepId(id)
    setRun((r) => r + 1)
  }
  return (
    <div className="flex h-dvh flex-col">
      <nav
        aria-label="フライト"
        data-flight-controls=""
        className="flex shrink-0 items-center gap-fib-2 overflow-x-auto border-b border-line px-fib-3 py-fib-1"
      >
        <Link href="/labo/gallery" className="shrink-0 text-[length:var(--fs--1)] text-ink-muted">
          ← 一覧
        </Link>
        {FLIGHT_STEP_IDS.map((id) => (
          <button
            key={id}
            type="button"
            title={FLIGHT_STEP_TITLES[id]}
            aria-pressed={id === stepId}
            onClick={() => play(id)}
            className="num inline-flex min-h-8 shrink-0 cursor-pointer items-center rounded-[var(--r-1)] border border-line bg-transparent px-fib-2 text-[length:var(--fs--1)] text-ink aria-pressed:border-mod aria-pressed:text-mod"
          >
            {id}
          </button>
        ))}
        <span className="truncate text-[length:var(--fs--1)] text-ink-muted">
          {FLIGHT_STEP_TITLES[stepId]}
        </span>
      </nav>
      <div className="min-h-0 flex-1">
        {/* key: every replay starts from the step's own "before" state */}
        <StepBoard key={`${stepId}-${run}`} stepId={stepId} run={run} />
      </div>
    </div>
  )
}
