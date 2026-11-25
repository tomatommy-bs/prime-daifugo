'use client'
/**
 * Design gallery (spec §10.5): every board piece and full-board compositions rendered from
 * mock state (`fixtures.ts`), with no socket. `?scene=<id>&scheme=light|dark` selects a
 * frame; without `scene` an index of scenes is shown. Not linked from home.
 *
 * Board components come only through the board barrel, so the gallery compiles against
 * Foundation's stubs and fills in as the cards / table / board tasks land.
 */
import {
  ActionBar,
  BoardLayout,
  ConnectionOverlay,
  DeckPile,
  FactorPanel,
  FieldSequence,
  FieldStack,
  GameSetDialog,
  GrothendieckCut,
  Hand,
  type LayoutMode,
  LiveRegion,
  type LogEntry,
  ProofLog,
  ResultOverlay,
  SeatLine,
  SeatRing,
  SubmitTray,
} from '@/app/room/[id]/_ui/board'
import { WaitingRoom } from '@/app/room/[id]/_ui/waiting-room'
import { Expr } from '@/design/Expr'
import { FactorTree } from '@/design/FactorTree'
import { ModRing } from '@/design/ModRing'
import { NumberGlyph } from '@/design/NumberGlyph'
import { SieveGrid } from '@/design/SieveGrid'
import { UlamField } from '@/design/UlamField'
import { IconModRing, IconTherefore } from '@/design/icons'
import { useLayoutMode } from '@/design/use-layout-mode'
import type { CardId } from '@/game-card/src'
import type { FactCardId } from '@/interface/common'
import { concatCardNumbers } from '@/utils/play-card'
import { useMantineColorScheme } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { LayoutGroup } from 'framer-motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  BOARD_SCENES,
  type BoardScene,
  HOME_PARTS,
  ROOM_ID,
  SCENE_IDS,
  SCENE_TITLES,
  type SceneId,
  WAITING_SCENE,
  buildSeatModels,
  isBoardSceneId,
  isSceneId,
} from './fixtures'

const noop = () => undefined

type Scheme = 'light' | 'dark'
const parseScheme = (value: string | null): Scheme | null =>
  value === 'light' || value === 'dark' ? value : null

/** Apply `?scheme=` through Mantine and restore the viewer's own choice on leave. */
function useSchemeParam(scheme: Scheme | null) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const previous = useRef(colorScheme)
  useEffect(() => {
    if (scheme === null) {
      return
    }
    const restore = previous.current
    setColorScheme(scheme)
    return () => setColorScheme(restore)
  }, [scheme, setColorScheme])
}

export default function GalleryPage() {
  const params = useSearchParams()
  const sceneParam = params.get('scene')
  const scheme = parseScheme(params.get('scheme'))
  useSchemeParam(scheme)

  // Client-only: scenes depend on the viewport (layout mode) and the viewer's motion
  // preference, neither of which the server can know, so skip SSR instead of hydrating
  // a guess.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="min-h-dvh bg-bg" data-gallery-loading="true" />
  }

  if (!isSceneId(sceneParam)) {
    return <GalleryIndex />
  }
  return (
    <div
      className="min-h-dvh bg-bg text-ink"
      data-gallery-scene={sceneParam}
      data-scheme={scheme ?? 'auto'}
    >
      <Scene id={sceneParam} />
    </div>
  )
}

function Scene({ id }: { id: SceneId }) {
  if (id === 'home-parts') {
    return <HomePartsScene />
  }
  if (id === 'waiting') {
    return <WaitingScene />
  }
  if (isBoardSceneId(id)) {
    // key: local interaction state resets per scene
    return <BoardSceneView key={id} scene={BOARD_SCENES[id]} />
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

function GalleryIndex() {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-[987px] flex-col gap-fib-5 bg-bg py-fib-5 text-ink"
      style={{ paddingInline: 'max(var(--sp-4), env(safe-area-inset-left))' }}
    >
      <header className="flex flex-col gap-fib-2">
        <Link href="/labo/calc" className="text-[length:var(--fs--1)] text-ink-muted">
          ← ラボ
        </Link>
        <h1 className="m-0 font-bold leading-[1.236] text-[length:var(--fs-4)]">
          デザインギャラリー
        </h1>
        <p className="m-0 text-ink-muted">
          モックの状態から盤面を描画します（ソケットなし）。
          <span className="num"> ?scene=… &amp; scheme=light|dark</span>
        </p>
      </header>
      <ol className="m-0 grid list-none grid-cols-1 gap-fib-3 p-0 sm:grid-cols-2">
        {SCENE_IDS.map((id, i) => (
          <li
            key={id}
            className="flex items-center gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface p-fib-3 shadow-[var(--shadow-1)]"
          >
            <span className="num w-8 shrink-0 text-ink-muted">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/labo/gallery?scene=${id}`} className="num font-bold text-ink">
                {id}
              </Link>
              <span className="truncate text-[length:var(--fs--1)] text-ink-muted">
                {SCENE_TITLES[id]}
              </span>
            </div>
            <Link
              href={`/labo/gallery?scene=${id}&scheme=light`}
              className="inline-flex min-h-11 items-center rounded-[var(--r-1)] px-fib-2 text-[length:var(--fs--1)] text-ink-muted hover:text-ink"
            >
              light
            </Link>
            <Link
              href={`/labo/gallery?scene=${id}&scheme=dark`}
              className="inline-flex min-h-11 items-center rounded-[var(--r-1)] px-fib-2 text-[length:var(--fs--1)] text-ink-muted hover:text-ink"
            >
              dark
            </Link>
          </li>
        ))}
      </ol>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* home-parts                                                          */
/* ------------------------------------------------------------------ */

function HomePartsScene() {
  const { counters } = HOME_PARTS
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden p-fib-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-40"
      >
        <UlamField side={41} cell={14} />
      </div>
      <div className="grid w-full max-w-[987px] grid-cols-[1.618fr_1fr] gap-fib-4 portrait-phone:grid-cols-1">
        <section
          aria-label="ホームの部品"
          className="flex min-w-0 flex-col gap-fib-3 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-2)]"
        >
          <div className="w-full overflow-hidden [&>svg]:h-auto [&>svg]:w-full">
            <SieveGrid n={100} cols={50} size={10} primeOpacity={0.25} />
          </div>
          <h1 className="m-0 font-bold leading-[1.236] tracking-[0.04em] text-[length:var(--fs-5)] wide:text-[length:var(--fs-6)]">
            素数大富豪
          </h1>
          <p className="m-0 text-ink-muted text-[length:var(--fs-1)]">
            Prime Daifugō <span className="num">· ∀p∈ℙ, p &gt; 場</span>
          </p>
          <dl className="m-0 grid grid-cols-3 border-t border-line pt-fib-3">
            {(
              [
                ['オンライン', counters.online],
                ['ロビー', counters.lobby],
                ['部屋', counters.rooms],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dd className="m-0">
                  <NumberGlyph value={value} size={4} />
                </dd>
                <dt className="text-[length:var(--fs--1)] text-ink-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-fib-3 text-[length:var(--fs--1)] text-ink-muted">
            <span>待機中</span>
            <NumberGlyph value={null} size={1} srLabel="未受信" />
            <span>（最初のメッセージまで —）</span>
          </div>
        </section>
        <section
          aria-label="数学の部品"
          className="flex min-w-0 flex-col items-center justify-center gap-fib-4 rounded-[var(--r-3)] border border-line bg-surface p-fib-4 shadow-[var(--shadow-1)]"
        >
          <div className="flex items-center gap-fib-4">
            <ModRing n={HOME_PARTS.modRing} filled={7} size={68} label="ℤ/12ℤ" />
            <IconModRing n={4} width={32} height={32} className="text-mod" />
            <IconTherefore width={32} height={32} className="text-ink-muted" />
          </div>
          <FactorTree value={HOME_PARTS.factorValue} factors={[...HOME_PARTS.factors]} />
          <Expr tokens={HOME_PARTS.expr} className="text-[length:var(--fs-3)]" />
        </section>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* waiting                                                             */
/* ------------------------------------------------------------------ */

function GalleryTopBar({ n, children }: { n: number; children?: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 items-center gap-fib-3 pr-[calc(var(--sp-6)+var(--sp-2))]">
      <span className="num shrink-0 font-bold text-mod">ℤ/{n}ℤ</span>
      <span className="shrink-0 text-ink-muted text-[length:var(--fs--1)]">
        Room <span className="num">{ROOM_ID}</span>
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-fib-3">{children}</div>
    </div>
  )
}

function WaitingScene() {
  const { presence, rule, selfId } = WAITING_SCENE
  const [current, setCurrent] = useState(presence.map((p) => ({ ...p })))
  const myPresence = current.find((p) => p.id === selfId)
  const setReady = (status: 'ready' | 'not-ready') =>
    setCurrent((prev) => prev.map((p) => (p.id === selfId ? { ...p, status } : p)))
  const [currentRule, setRule] = useState({ ...rule })
  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{
        paddingInline: 'max(var(--sp-3), env(safe-area-inset-left), env(safe-area-inset-right))',
      }}
    >
      <header className="h-[36px] shrink-0 border-b border-line wide:h-[52px]">
        <GalleryTopBar n={current.length} />
      </header>
      <main className="mx-auto flex w-full max-w-[987px] flex-1 items-center py-fib-3">
        <div className="w-full">
          <WaitingRoom
            rule={currentRule}
            onChangeRule={(r) => setRule((prev) => ({ ...prev, ...r }))}
            presence={current}
            myPresence={myPresence}
            onGameStart={noop}
            onSetReady={() => setReady('ready')}
            onUnsetReady={() => setReady('not-ready')}
          />
        </div>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Board scenes                                                        */
/* ------------------------------------------------------------------ */

const ACTION_ORIENTATION: Record<LayoutMode, 'rail' | 'row' | 'bottom'> = {
  compact: 'rail',
  regular: 'rail',
  portrait: 'bottom',
  wide: 'row',
}

const toLogEntries = (scene: BoardScene): LogEntry[] =>
  [...scene.log].reverse().map((line) => ({ id: line.id, kind: line.kind, node: line.text }))

/** Local, socket-free copy of `useMyField` so the gallery can exercise card flights. */
function useGalleryField(scene: BoardScene) {
  const initial = scene.myField
  const [hand, setHand] = useState<CardId[]>(initial?.hand ?? [])
  const [tray, setTray] = useState<CardId[]>(initial?.tray ?? [])
  const [factCards, setFactCards] = useState<FactCardId[]>(initial?.factCards ?? [])
  const [mode, setMode] = useState<'basic' | 'factor'>(initial?.mode ?? 'basic')

  const select = (card: CardId) => {
    setHand((prev) => prev.filter((c) => c !== card))
    if (mode === 'factor') {
      setFactCards((prev) => [...prev, card])
    } else {
      setTray((prev) => [...prev, card])
    }
  }
  const returnCards = (cards: FactCardId[]) => {
    const back = cards.filter((c): c is CardId => c !== '*' && c !== '^')
    setHand((prev) => [...prev, ...back])
  }
  return {
    hand,
    tray,
    factCards,
    mode,
    select,
    removeFromTray: (card: CardId) => {
      setTray((prev) => prev.filter((c) => c !== card))
      returnCards([card])
    },
    reset: () => {
      returnCards([...tray, ...factCards])
      setTray([])
      setFactCards([])
    },
    addOperator: (op: '*' | '^') => setFactCards((prev) => [...prev, op]),
    removeFact: (index: number) => {
      returnCards(factCards.slice(index, index + 1))
      setFactCards((prev) => prev.filter((_, i) => i !== index))
    },
    toggleMode: () => {
      if (mode === 'factor') {
        returnCards(factCards)
        setFactCards([])
      }
      setMode((prev) => (prev === 'factor' ? 'basic' : 'factor'))
    },
  }
}

function BoardSceneView({ scene }: { scene: BoardScene }) {
  const layoutMode = useLayoutMode()
  const { ref: tableRef, width: tableW, height: tableH } = useElementSize()
  const field = useGalleryField(scene)
  const { gameState, ctx, selfId } = scene

  const seats =
    gameState && ctx
      ? buildSeatModels({
          gameState,
          ctx,
          presence: scene.presence,
          selfId,
          passedIds: scene.passedIds,
          leftTime: scene.leftTime,
          penalty: scene.penalty,
        })
      : []
  const players = seats.filter((s) => !s.observer)
  const n = Math.max(players.length, 1)
  const isMyTurn = ctx?.currentPlayer === selfId
  const self = gameState?.players[selfId]
  const fieldTop = scene.fieldView.at(-1) ?? null
  const leadName = players.find((s) => s.isLead)?.name ?? null
  const deckCount = gameState?.deck.length ?? 0
  const drawReason = !isMyTurn
    ? 'not-your-turn'
    : deckCount === 0
      ? 'empty'
      : self?.drawRight === false
        ? 'drawn'
        : null
  const factorOpen = scene.myField !== null && field.mode === 'factor'
  const factorTarget = field.tray.length > 0 ? concatCardNumbers(field.tray) : 0

  const overlay = scene.result ? (
    <ResultOverlay result={scene.result} onDone={noop} />
  ) : scene.cut57 ? (
    <GrothendieckCut active={true} onDone={noop} skippable={true} />
  ) : null

  const fieldNode = (
    <div className="flex h-full min-w-0 flex-col items-stretch justify-center gap-fib-1">
      {scene.struckSequence ? (
        <FieldSequence values={scene.struckSequence} struck={true} layout="line" />
      ) : null}
      <FieldStack field={scene.fieldView} leadName={leadName} resultOverlay={overlay} />
    </div>
  )

  // The active seat carries its own TurnTimer (SeatModel.leftTime), so the bar holds
  // only the residue line (compact / portrait) or the room chrome (wide).
  const top =
    layoutMode === 'wide' ? (
      <GalleryTopBar n={n} />
    ) : (
      <div className="flex h-full min-w-0 items-center pr-[calc(var(--sp-6)+var(--sp-2))]">
        <div className="min-w-0 flex-1 overflow-hidden">
          <SeatLine seats={seats} n={n} />
        </div>
      </div>
    )

  const table =
    layoutMode === 'wide' ? (
      <div ref={tableRef} className="h-full min-h-[320px] w-full">
        <SeatRing seats={seats} width={tableW || 960} height={tableH || 520}>
          {fieldNode}
        </SeatRing>
      </div>
    ) : (
      fieldNode
    )

  const observerNotice = (
    <div className="flex h-full items-center justify-center gap-fib-2 text-ink-muted">
      <span className="rounded-[var(--r-1)] border border-border-strong px-fib-2 py-1 font-bold text-[length:var(--fs--1)]">
        観戦
      </span>
      <span>観戦中です · 手札はありません</span>
    </div>
  )

  const board = (
    <BoardLayout
      mode={layoutMode}
      top={top}
      deck={
        <DeckPile
          count={deckCount}
          canDraw={drawReason === null && scene.myField !== null}
          disabledReason={scene.myField ? drawReason : null}
          onDraw={scene.myField ? noop : undefined}
          compact={layoutMode === 'compact'}
        />
      }
      field={table}
      tray={
        scene.myField ? (
          <div className="flex h-full min-w-0 flex-col gap-fib-1">
            <SubmitTray
              cardIds={field.tray}
              fieldTop={fieldTop}
              onRemove={field.removeFromTray}
              onReset={field.reset}
            />
            <FactorPanel
              open={factorOpen}
              target={factorTarget}
              factCards={field.factCards}
              onAddOperator={field.addOperator}
              onRemove={field.removeFact}
              onClose={field.toggleMode}
            />
          </div>
        ) : null
      }
      actions={
        scene.myField ? (
          <ActionBar
            canDraw={drawReason === null}
            drawReason={drawReason}
            canPass={isMyTurn}
            canSubmit={isMyTurn && field.tray.length > 0}
            factorMode={field.mode === 'factor'}
            factorDisabled={field.tray.length === 0}
            isMyTurn={isMyTurn}
            onDraw={noop}
            onPass={noop}
            onSubmit={noop}
            onToggleFactor={field.toggleMode}
            orientation={ACTION_ORIENTATION[layoutMode]}
            showKbd={true}
          />
        ) : null
      }
      hand={
        scene.myField ? (
          <Hand
            cardIds={field.hand}
            isMyTurn={isMyTurn}
            mode={field.mode}
            freshIds={scene.freshIds}
            onSelect={field.select}
          />
        ) : (
          observerNotice
        )
      }
      log={
        layoutMode === 'wide' ? (
          <ProofLog entries={toLogEntries(scene)} variant="sidebar" />
        ) : undefined
      }
      factorOpen={factorOpen}
    />
  )

  return (
    <div className="min-h-dvh" data-card-size="M" data-self={selfId}>
      <LayoutGroup id="board">
        <ConnectionOverlay state={scene.connection} onReconnect={noop}>
          {board}
        </ConnectionOverlay>
      </LayoutGroup>
      <GameSetDialog
        opened={scene.gameSet !== null}
        winner={scene.gameSet?.winner ?? null}
        standings={scene.gameSet?.standings ?? []}
        plays={scene.log.filter((l) => l.kind === 'play').length}
        onNextRound={noop}
        canStart={true}
      />
      <LiveRegion message={scene.live} />
    </div>
  )
}
