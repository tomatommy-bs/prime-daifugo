'use client'
/**
 * The game board container (§6.4): the room session (`useRoomSession`, rebuild spec §9),
 * `useMyField`, notifications and the director. Presentation lives in the board components;
 * this file only wires them together through `BoardLayout`.
 * Game state is applied immediately; only visuals are queued by the director (§9.3).
 * Snapshots (welcome, seq gap) set state without animation (RQ-C3). There is no client
 * auto-pass: the server owns the deadline and passes on timeout (RQ-C7, RQ-T2).
 */
import { useReducedMotionSafe } from '@/design/motion'
import { useBoxSize } from '@/design/use-box-size'
import { useLayoutMode } from '@/design/use-layout-mode'
import { type CardId, preloadCourtFaces } from '@/game-card/src'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type { ClientGameStateBundle } from '@/shared/client-state'
import type { RejectReason } from '@/shared/protocol'
import { concatCardNumbers } from '@/utils/play-card'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { LayoutGroup } from 'framer-motion'
import _ from 'lodash'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { useMyField } from '../hooks'
import ClientRoomManager from '../room-manager'
import type { AckResult, SessionTransition } from '../session/types'
import { useRoomSession } from '../session/use-room-session'
import { RoomChromeContext, SHOW_VALUES_KEY } from './RoomHeader'
import * as B from './board'
import { ACTION_ORIENTATION, drawDisabledReason, validateSubmitCardSet } from './board/board-state'
import * as T from './board/classify-transition'
import { ruleDiff } from './board/rule-diff'
import { useBoardDirector } from './board/use-board-director'
import NotifyMessageContent, * as Notice from './notification-message'
import { WaitingRoom } from './waiting-room'

type Props = {
  id: string
  size?: 'S' | 'M' | 'L'
  onLogNotification?: (message: ReactNode) => void
}

export const TRAY_WIPE_MESSAGE = '場が更新されたので選択を戻しました'
const TRAY_WIPE_THROTTLE_MS = 5000
/** For toasts whose text another live region (LiveRegion, the tray) already announces. */
export const SILENT_TOAST_ROLE = 'none'
const CEREMONY = new Set<B.BoardEvent['type']>(['submit-ok', 'submit-fail', 'cut57'])
export const TIMEOUT_MESSAGE = '時間切れです'
export const GAME_START_MESSAGE = 'ゲームを開始します'

/** Why the server rejected a submit (ack `ok:false`), in the tray-error copy (RQ-C6). */
export const SUBMIT_REJECT_MESSAGES: Partial<Record<RejectReason, string>> = {
  'not-your-turn': 'あなたの番ではありません',
  stale: 'その手番はもう終わっています',
  'invalid-move': '出せないカードです',
  'invalid-fact': '素因数分解として成立していません',
  'deck-empty': '山札がありません',
  'already-drawn': 'すでにドローしています',
  'bad-status': 'ゲームは進行中ではありません',
}
export const SUBMIT_REJECT_FALLBACK = '送信できませんでした。もう一度お試しください'

export function submitRejectMessage(result: Exclude<AckResult, { ok: true }>): string {
  return SUBMIT_REJECT_MESSAGES[result.reason as RejectReason] ?? SUBMIT_REJECT_FALLBACK
}

const GameBoard: React.FC<Props> = ({ id, size: compSizeOption = 'M', ...props }) => {
  const session = useRoomSession(id)
  const { presence, roomStatus, rule, actions } = session
  const game = session.game
  const self = session.selfId ?? ''
  const [winner, setWinner] = useState('')
  const [memo, setMemo] = useState<T.BoardMemo>(T.EMPTY_MEMO)
  const [freshIds, setFreshIds] = useState<CardId[]>([])
  const [tray, setTray] = useState({ error: null as string | null, shakeKey: 0 })
  const [live, setLive] = useState<string | null>(null)
  const wipedAt = useRef(0)
  const ruleRef = useRef<PrimeDaifugoSetupData>(rule) // the last rule the log has seen
  const flights = useRef<B.FlightLayerHandle>(null)
  const mode = useLayoutMode()
  const table = useBoxSize()
  const director = useBoardDirector({ reduced: useReducedMotionSafe() })
  const chrome = useContext(RoomChromeContext)
  const [showValues] = useLocalStorage({ key: SHOW_VALUES_KEY, defaultValue: false })

  const my = useMyField({
    all: [],
    field: game?.gameState.field ?? [],
    maxSubmitNumberCards: game?.gameState.rule.maxSubmitNumCards,
  })
  const { submitCardIds, factCardIds, isFactorizationMode: factorMode } = my
  const nameOf = (pid?: string | null) => presence.find((p) => p.id === pid)?.name ?? ''
  const announce = (m: string) => setLive((prev) => (prev === m ? `${m}​` : m))
  /**
   * Board events (draw, pass, plays, the winner) are shown in the board itself and written
   * to the proof log; only errors (red notices, e.g. a failed submit) also toast (§9.2 #29).
   * The LiveRegion is the one screen-reader channel for board events, so these toasts are
   * `role="none"` (Mantine's default `alert` would read the same failure a second time).
   */
  const notify = (message: ReactNode, color?: string) => {
    if (color === 'red') {
      notifications.show({ message, color, role: SILENT_TOAST_ROLE })
    }
    props.onLogNotification?.(message)
  }
  const log = (message: ReactNode) => props.onLogNotification?.(message)
  const handOf = (bundle: ClientGameStateBundle | null) =>
    bundle?.gameState.players[self]?.hand ?? []

  /** Visual bookkeeping for one server event (the state itself is already applied). */
  const direct = (prev: T.GameState | null, next: T.GameState, msg: T.SystemMessage) => {
    const events = T.classifyTransition(prev, next, msg, self)
    // measured before React commits `next`: the sources are still on screen
    flights.current?.launch(B.planFlights(events, { selfId: self, prev, next }))
    for (const e of events) {
      e.type === 'end' ? director.holdEnd(e) : director.push(e)
      const line = T.announcementOf(e, nameOf, self)
      if (line) {
        announce(line)
      }
    }
    setMemo((m) => events.reduce(T.reduceMemo, m))
    const fresh = T.freshCards(prev, next, events, self)
    if (fresh) {
      setFreshIds(fresh)
    }
  }

  /** One session transition: notices and the log, the director, then the hand. */
  const onTransition = (t: SessionTransition) => {
    const { msg, event } = t
    if (msg.action === 'snapshot') {
      // welcome / seq gap / forfeit: state only, no flights or penalty animation (RQ-C3)
      my.setHandCardIds(handOf(t.next))
      return
    }
    if (msg.action === 'change-rule') {
      const diff = ruleDiff(ruleRef.current, msg.rule).join(' · ')
      ruleRef.current = msg.rule
      log(<Notice.SystemNotice>ルールを変更しました{diff ? `: ${diff}` : ''}</Notice.SystemNotice>)
      return
    }
    switch (msg.action) {
      case 'game-start':
        log(<Notice.SystemNotice>{GAME_START_MESSAGE}</Notice.SystemNotice>)
        break
      case 'draw':
        notify(<Notice.DrawNotice sender={msg.commander.name} />)
        break
      case 'pass': {
        if (event?.type === 'passed' && event.reason === 'timeout') {
          // the server passed on the deadline; the client never sends this pass (RQ-T5)
          if (event.by === self) {
            notifications.show({ message: TIMEOUT_MESSAGE, color: 'red' })
          }
          log(TIMEOUT_MESSAGE)
        }
        notify(<NotifyMessageContent.OnPass sender={msg.commander.name} />)
        break
      }
      case 'submit': {
        for (const n of Notice.submitNotices(
          msg.commander.name,
          msg.submissionResult.submitCardSet,
          msg.submissionResult.result,
        )) {
          notify(n.message, n.color)
        }
        break
      }
      case 'game-end': {
        const name = event?.type === 'game-ended' ? event.winnerName : msg.winner
        notify(<Notice.EndNotice winner={name} />)
        setWinner(name)
        break
      }
      default:
        break
    }
    direct(t.prev, t.next, msg)
    const hand = handOf(t.next)
    if (!t.next.ctx.playOrder.includes(self)) {
      // an observer or a late joiner: no hand, no tray to wipe
      my.setHandCardIds(hand)
      return
    }
    // No helper toast for my own submit, nor at game end (the winner's tray is already empty)
    const ownSubmit = msg.action === 'submit' && msg.commander.id === self
    const quiet = ownSubmit || msg.action === 'game-end'
    const trayFull = submitCardIds.length > 0 || factCardIds.length > 0
    if (trayFull && !quiet && Date.now() - wipedAt.current >= TRAY_WIPE_THROTTLE_MS) {
      wipedAt.current = Date.now()
      notifications.show({ message: TRAY_WIPE_MESSAGE })
    }
    my.setHandCardIds(hand)
  }
  // the listener always calls the latest render's handler (fresh tray, presence, selfId)
  const onTransitionRef = useRef(onTransition)
  onTransitionRef.current = onTransition
  useEffect(() => session.subscribe((t) => onTransitionRef.current(t)), [session.subscribe])

  // A session that already holds a game when the board mounts (a remount), or a first welcome
  // snapshot that carried selfId and the game together: its transition ran with the previous
  // render's (empty) selfId, so the hand is synced again once selfId is known.
  const sessionRef = useRef(session)
  sessionRef.current = session
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount and when selfId changes
  useEffect(() => {
    const hand = handOf(sessionRef.current.game)
    if (hand.length > 0) {
      my.setHandCardIds(hand)
    }
  }, [self])
  // keeps the rule-diff baseline in step with snapshots (late join, reconnect)
  useEffect(() => {
    ruleRef.current = rule
  }, [rule])

  // the header 「退出」 needs the session's leave (spec §3.6)
  useEffect(() => {
    chrome.setLeave?.(() => sessionRef.current.actions.leave())
    return () => chrome.setLeave?.(null)
  }, [chrome])

  const myPresence = presence.find((p) => p.id === self)
  const handleGameStart = () => actions.startGame()
  const handleChangeRule = (patch: Partial<PrimeDaifugoSetupData>) => actions.changeRule(patch)

  const gs = game?.gameState
  const fieldTop = _.nth(gs?.field, -1)
  // moves only while the round is live: under GAME SET the server has already moved
  // currentPlayer on, and a D / P there would run a move on the finished game
  const playing = roomStatus === 'playing'
  const isMyTurn = self !== '' && game?.ctx.currentPlayer === self
  const canMove = isMyTurn && playing
  const deckCount = gs?.deckCount ?? 0
  const drawReason = drawDisabledReason({
    isMyTurn,
    drawRight: gs?.players[self]?.drawRight,
    deckCount,
  })
  const canDraw = drawReason === null && gs !== undefined && playing
  const current = director.current
  const seats = B.buildSeats({
    gameState: gs ?? null,
    ctx: game?.ctx ?? null,
    presence,
    selfId: self,
    passedIds: memo.passedIds,
    penalties: current?.type === 'submit-fail' ? memo.penalties : {},
  })
  const players = B.playerSeats(seats)
  const n = gs ? players.length : presence.length
  // seats are exactly the play order; everyone else (observers, late joiners) only watches
  const observer =
    game !== null && (myPresence?.role === 'observer' || !game.ctx.playOrder.includes(self))
  const winnerId = gs?.winner ?? null
  const canStart = ClientRoomManager.canStartGame(presence)
  const selfReady = myPresence?.status === 'ready'

  useEffect(() => chrome.onBoardInfo?.({ status: roomStatus, n }), [chrome, roomStatus, n])
  // court faces are lazy chunks: fetch them once the board (not the waiting room) is up
  const onBoard = roomStatus !== null && roomStatus !== 'waiting'
  useEffect(() => {
    if (onBoard) {
      preloadCourtFaces().catch(() => undefined)
    }
  }, [onBoard])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a tray change clears the message
  useEffect(() => setTray((t) => ({ ...t, error: null })), [submitCardIds, factCardIds])
  // a snapshot straight into GAME SET (reload during the dialog) has no game-ended event
  const snapWinner = nameOf(gs?.winner) || null
  useEffect(() => {
    if (roomStatus === 'waitingNextRound') {
      director.holdEnd({ type: 'end', winner: snapWinner })
    }
  }, [roomStatus, snapWinner, director.holdEnd])
  const endedWinner = director.ended ? (director.ended.winner ?? winner) : null
  // 「残り5秒」 from the deadline-driven clock (RQ-T5)
  const urgentRef = useRef(false)
  urgentRef.current = isMyTurn && playing
  // biome-ignore lint/correctness/useExhaustiveDependencies: announce only sets state
  useEffect(
    () =>
      session.clock.subscribe(() => {
        if (session.clock.get() === 5 && urgentRef.current) {
          announce('残り5秒')
        }
      }),
    [session.clock],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: announce once per release
  useEffect(() => {
    if (endedWinner) {
      announce(`${endedWinner} の勝ち`)
    }
  }, [endedWinner])

  const handleSubmit = async () => {
    const errMessage = validateSubmitCardSet(fieldTop, {
      submit: submitCardIds,
      factor: factCardIds,
    })
    if (errMessage !== null) {
      // SubmitTray's polite error region reads the message; the toast stays silent
      notifications.show({ message: errMessage, color: 'red', role: SILENT_TOAST_ROLE })
      setTray((t) => ({ error: errMessage, shakeKey: t.shakeKey + 1 }))
      return
    }
    const result = await actions.submit({ submit: submitCardIds, factor: factCardIds })
    if (!result.ok) {
      // the server's judgement goes through the same tray-error path (RQ-C6)
      const message = submitRejectMessage(result)
      notifications.show({ message, color: 'red', role: SILENT_TOAST_ROLE })
      setTray((t) => ({ error: message, shakeKey: t.shakeKey + 1 }))
    }
  }
  const addOperator = (op: '*' | '^') => factorMode && my.selectHandCardIdAsFact(op)
  B.useBoardShortcuts(
    {
      x: () => addOperator('*'),
      '*': () => addOperator('*'),
      '^': () => addOperator('^'),
      Backspace: (e) => {
        e.preventDefault()
        if (factorMode && factCardIds.length > 0) {
          my.removeFactCard(factCardIds.length - 1)
        } else if (submitCardIds.length > 0) {
          my.removeSubmitCardId(submitCardIds[submitCardIds.length - 1])
        }
      },
      // Esc skips a ceremony first, then resets the tray
      Escape: () => (current && CEREMONY.has(current.type) ? director.done() : my.reset()),
    },
    playing,
  )

  const submitter = current && 'playerId' in current ? nameOf(current.playerId) : ''
  const fieldStack = (
    <B.FieldStack
      field={gs?.field ?? []}
      leadName={nameOf(gs?.deckTopPlayer) || null}
      flightHandoff={true}
      resultOverlay={
        <>
          <B.ResultOverlay result={T.resultViewOf(current, submitter)} onDone={director.done} />
          <B.GrothendieckCut
            active={current?.type === 'cut57'}
            onDone={director.done}
            cards={current?.type === 'cut57' ? current.cards : undefined}
          />
        </>
      }
    />
  )
  const timer = (
    <B.SeatClock
      active={players.some((s) => s.isActive)}
      timeLimit={gs?.rule.timeLimit ?? rule.timeLimit}
    />
  )

  return (
    <B.TurnClockContext.Provider value={session.clock}>
      <div
        data-card-size={compSizeOption}
        data-room-status={roomStatus ?? 'unknown'}
        className="h-full"
      >
        <B.ConnectionOverlay
          state={session.connection}
          reason={session.closeReason}
          onReconnect={actions.reconnect}
        >
          {/* one LayoutGroup around both screens, so the waiting ring's seat-<id> layoutIds
            match the table's and the seats morph into place when the game starts (#6) */}
          <LayoutGroup id="board">
            {roomStatus === 'waiting' ? (
              <WaitingRoom
                rule={rule}
                onChangeRule={handleChangeRule}
                presence={presence}
                myPresence={myPresence}
                onGameStart={handleGameStart}
                onSetReady={() => actions.setReady()}
                onUnsetReady={() => actions.unsetReady()}
              />
            ) : (
              <B.BoardLayout
                mode={mode}
                factorOpen={factorMode}
                top={
                  <B.BoardTopBar
                    mode={mode}
                    seats={seats}
                    n={n}
                    timer={timer}
                    isMyTurn={isMyTurn}
                    reserveRight={mode === 'compact' || mode === 'portrait'}
                  />
                }
                deck={
                  <B.DeckPile
                    count={deckCount}
                    canDraw={canDraw}
                    disabledReason={drawReason}
                    onDraw={mode === 'wide' ? () => actions.draw() : undefined}
                    compact={mode !== 'wide'}
                  />
                }
                field={
                  mode === 'wide' ? (
                    <div ref={table.ref} className="h-full min-h-0 w-full">
                      <B.SeatRing
                        seats={seats}
                        width={table.width || 960}
                        height={table.height || 420}
                        shimmerKey={current?.type === 'submit-ok' ? memo.plays : null}
                        rippleFromId={director.ended ? winnerId : null}
                      >
                        {fieldStack}
                      </B.SeatRing>
                    </div>
                  ) : (
                    fieldStack
                  )
                }
                tray={
                  <div className="flex h-full min-h-0 flex-col gap-fib-1">
                    <B.SubmitTray
                      cardIds={submitCardIds}
                      fieldTop={fieldTop ?? null}
                      onRemove={my.removeSubmitCardId}
                      onReset={my.reset}
                      hasFactor={factorMode || factCardIds.length > 0}
                      shakeKey={tray.shakeKey}
                      errorMessage={tray.error}
                    />
                    <B.FactorPanel
                      open={factorMode}
                      target={concatCardNumbers(submitCardIds)}
                      factCards={factCardIds}
                      onAddOperator={my.selectHandCardIdAsFact}
                      onRemove={my.removeFactCard}
                      onClose={my.toggleMode}
                    />
                  </div>
                }
                actions={
                  <B.ActionBar
                    orientation={ACTION_ORIENTATION[mode]}
                    canDraw={canDraw}
                    drawReason={drawReason}
                    canPass={canMove}
                    canSubmit={submitCardIds.length > 0 && canMove}
                    shortcuts={playing}
                    factorMode={factorMode}
                    // leaving factor mode stays possible even after the tray was emptied
                    factorDisabled={submitCardIds.length === 0 && !factorMode}
                    isMyTurn={isMyTurn}
                    onDraw={() => actions.draw()}
                    onPass={() => actions.pass()}
                    onSubmit={handleSubmit}
                    onToggleFactor={my.toggleMode}
                  />
                }
                hand={
                  <div
                    className="relative h-full"
                    data-observer={observer && gs ? 'true' : undefined}
                  >
                    <B.Hand
                      cardIds={my.handCardIds}
                      isMyTurn={isMyTurn}
                      mode={factorMode ? 'factor' : 'basic'}
                      freshIds={freshIds}
                      showValues={showValues}
                      layout={mode === 'portrait' ? 'wrap' : 'auto'}
                      onSelect={
                        factorMode ? my.selectHandCardIdAsFact : my.selectHandCardIdAsSubmit
                      }
                    />
                    {observer && gs ? <ObserverNote /> : null}
                  </div>
                }
              />
            )}
          </LayoutGroup>
        </B.ConnectionOverlay>
        <B.GameSetDialog
          opened={roomStatus === 'waitingNextRound' && director.ended !== null}
          winner={endedWinner || null}
          standings={players.map((s) => ({ name: s.name, handCount: s.handCount ?? 0 }))}
          plays={memo.plays}
          onNextRound={handleGameStart}
          canStart={canStart}
          selfReady={selfReady}
          isObserver={observer}
          onToggleReady={() => (selfReady ? actions.unsetReady() : actions.setReady())}
        />
        <B.LiveRegion message={live} />
        <B.FlightLayer ref={flights} />
      </div>
    </B.TurnClockContext.Provider>
  )
}

const ObserverNote = () => (
  <p className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center gap-fib-2 text-ink-muted">
    <span className="rounded-[var(--r-1)] border border-line px-fib-2 font-semibold">観戦</span>
    次のラウンドから参加できます
  </p>
)

export { GameBoard }
