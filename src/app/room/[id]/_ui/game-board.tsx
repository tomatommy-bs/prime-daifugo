'use client'
/**
 * The game board container (§6.4): socket, server state, `useMessageHandler` /
 * `useMyField`, notifications, the auto-pass and the director. Presentation lives in the
 * board components; this file only wires them together through `BoardLayout`.
 * Game state is applied immediately; only visuals are queued by the director (§9.3).
 */
import { GAME_CONFIG } from '@/constants/config'
import { PARTYKIT_HOST } from '@/constants/env'
import type { ROOM_STATUS } from '@/constants/status'
import { useReducedMotionSafe } from '@/design/motion'
import { useBoxSize } from '@/design/use-box-size'
import { useLayoutMode } from '@/design/use-layout-mode'
import { type CardId, preloadCourtFaces } from '@/game-card/src'
import type { PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import { concatCardNumbers } from '@/utils/play-card'
import { useLocalStorage, useSetState } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { LayoutGroup } from 'framer-motion'
import Cookies from 'js-cookie'
import _ from 'lodash'
import usePartySocket from 'partysocket/react'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { ClientMessenger } from '../client-messenger'
import { useMessageHandler, useMyField } from '../hooks'
import { RoomChromeContext, SHOW_VALUES_KEY } from './RoomHeader'
import * as B from './board'
import {
  ACTION_ORIENTATION,
  connectionStateOf,
  drawDisabledReason,
  isObserver,
  validateSubmitCardSet,
  winnerIdOf,
} from './board/board-state'
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

const GameBoard: React.FC<Props> = ({ id, size: compSizeOption = 'M', ...props }) => {
  const [rule, setRule] = useSetState<PrimeDaifugoSetupData>({
    initNumCards: GAME_CONFIG.initialNumCards as number,
    timeLimit: GAME_CONFIG.timeLimit as number,
    maxSubmitNumCards: GAME_CONFIG.maxSubmitNumCards as number,
    halfEvenNumbers: false,
  })
  const [presence, setPresence] = useState<serverToClient.PresenceEvent['presence']>([])
  const [roomStatus, setRoomStatus] = useState<
    (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS] | null
  >(null)
  const [gameServerState, setGameServerState] = useState<T.GameState | null>(null)
  const serverRef = useRef<T.GameState | null>(null) // latest state, readable between renders
  const serverRuleRef = useRef<Partial<PrimeDaifugoSetupData>>(rule)
  const [winner, setWinner] = useState('')
  // ticks go to a store read only by the clock faces, not to state (no board re-render)
  const clock = useRef<B.TurnClock | null>(null)
  clock.current ??= B.createTurnClock()
  const [memo, setMemo] = useState<T.BoardMemo>(T.EMPTY_MEMO)
  const [freshIds, setFreshIds] = useState<CardId[]>([])
  const [tray, setTray] = useState({ error: null as string | null, shakeKey: 0 })
  const [live, setLive] = useState<string | null>(null)
  const [, rerender] = useState(0) // socket open / close
  const wipedAt = useRef(0)
  const errored = useRef(false) // the last connection attempt failed (until the next open)
  const flights = useRef<B.FlightLayerHandle>(null)
  const mode = useLayoutMode()
  const table = useBoxSize()
  const director = useBoardDirector({ reduced: useReducedMotionSafe() })
  const chrome = useContext(RoomChromeContext)
  const [showValues] = useLocalStorage({ key: SHOW_VALUES_KEY, defaultValue: false })

  const my = useMyField({
    all: [],
    field: gameServerState?.gameState.field ?? [],
    maxSubmitNumberCards: gameServerState?.gameState.rule.maxSubmitNumCards,
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

  /** Visual bookkeeping for one server event (the state itself is already applied). */
  const direct = (prev: T.GameState | null, next: T.GameState, msg: T.SystemMessage) => {
    const events = T.classifyTransition(prev, next, msg, ws.id)
    // measured before React commits `next`: the sources are still on screen
    flights.current?.launch(B.planFlights(events, { selfId: ws.id, prev, next }))
    for (const e of events) {
      e.type === 'end' ? director.holdEnd(e) : director.push(e)
      const line = T.announcementOf(e, nameOf, ws.id)
      if (line) {
        announce(line)
      }
    }
    setMemo((m) => events.reduce(T.reduceMemo, m))
    const fresh = T.freshCards(prev, next, events, ws.id)
    if (fresh) {
      setFreshIds(fresh)
    }
  }

  const { onMessage } = useMessageHandler({
    onChat: ({ message, from }) => {
      const sender = presence.find((p) => p.id === from)?.name
      notifications.show({
        message: <NotifyMessageContent.Chat sender={sender} message={message} />,
      })
    },
    onPresence: ({ presence }) => setPresence(presence),
    onPass: ({ commander }) => notify(<NotifyMessageContent.OnPass sender={commander.name} />),
    onSubmit: ({ commander, submissionResult: { submitCardSet, result } }) => {
      for (const n of Notice.submitNotices(commander.name, submitCardSet, result)) {
        notify(n.message, n.color)
      }
    },
    onDraw: ({ commander }) => notify(<Notice.DrawNotice sender={commander.name} />),
    onEndGame: ({ winner }) => {
      notify(<Notice.EndNotice winner={winner} />)
      setWinner(winner)
    },
    onGameEvent: (params) => {
      const prev = serverRef.current
      const next = { gameState: params.gameState, ctx: params.ctx }
      serverRef.current = next
      setGameServerState(next)
      // hooks.ts forwards the parsed system message verbatim, so it carries `action`
      const msg = params as unknown as T.SystemMessage
      direct(prev, next, msg)
      if (myPresence?.status === 'not-ready') {
        return
      }
      // No helper toast for my own submit, nor at game end: the server sends game-end before
      // the winning submit, so the winner's tray still holds the cards they just played.
      const ownSubmit = msg.action === 'submit' && params.commander.id === ws.id
      const quiet = ownSubmit || msg.action === 'game-end'
      const trayFull = submitCardIds.length > 0 || factCardIds.length > 0
      if (trayFull && !quiet && Date.now() - wipedAt.current >= TRAY_WIPE_THROTTLE_MS) {
        wipedAt.current = Date.now()
        notifications.show({ message: TRAY_WIPE_MESSAGE })
      }
      // a late joiner (ready, but dealt no hand) has no entry in players: an empty hand
      const hand = params.gameState?.players?.[ws.id]?.hand ?? []
      my.setHandCardIds(hand)
    },
    onRoomStatus: ({ status }) => {
      setRoomStatus(status)
      if (status === 'playing') {
        props.onLogNotification?.(<Notice.SystemNotice>ゲームを開始します</Notice.SystemNotice>)
      }
      if (status === 'waitingNextRound') {
        director.holdEnd({ type: 'end', winner: null })
      }
    },
    onTimeCount: ({ leftTime: _leftTime }) => {
      const mine = serverRef.current?.ctx.currentPlayer === ws.id
      if (_leftTime === 0) {
        if (mine) {
          notifications.show({ message: '時間切れです', color: 'red' })
          ClientMessenger.pass({ ws })
        }
        props.onLogNotification?.('時間切れです')
      } else {
        clock.current?.set(_leftTime)
        if (_leftTime === 5 && mine) {
          announce('残り5秒')
        }
      }
    },
    onChangeRule: ({ rule }) => {
      setRule(rule)
      const diff = ruleDiff(serverRuleRef.current, rule).join(' · ')
      serverRuleRef.current = { ...serverRuleRef.current, ...rule }
      props.onLogNotification?.(
        <Notice.SystemNotice>ルールを変更しました{diff ? `: ${diff}` : ''}</Notice.SystemNotice>,
      )
    },
  })

  const ws = usePartySocket({
    host: PARTYKIT_HOST,
    party: 'room',
    room: id,
    onMessage: (e) => onMessage(e.data),
    onOpen: () => {
      errored.current = false
      ClientMessenger.sendName({ ws, name: Cookies.get('name') ?? 'unknown' })
      rerender((n) => n + 1)
    },
    onClose: () => rerender((n) => n + 1),
    onError: () => {
      errored.current = true
      rerender((n) => n + 1)
    },
  })

  const myPresence = presence.find((p) => p.id === ws?.id)
  const handleGameStart = (rule?: PrimeDaifugoSetupData) => ClientMessenger.startGame({ ws, rule })
  const handleChangeRule = (newRule: Partial<PrimeDaifugoSetupData>) => {
    setRule(newRule)
    ClientMessenger.changeRule({ ws, rule: { ...rule, ...newRule } })
  }

  const gs = gameServerState?.gameState
  const fieldTop = _.nth(gs?.field, -1)
  // moves only while the round is live: under GAME SET the server has already moved
  // currentPlayer on, and a D / P there would run a move on the finished game
  const playing = roomStatus === 'playing'
  const isMyTurn = gameServerState?.ctx?.currentPlayer === ws.id
  const canMove = isMyTurn && playing
  const deckCount = gs?.deck.length ?? 0
  const drawReason = drawDisabledReason({
    isMyTurn,
    drawRight: gs?.players[ws.id]?.drawRight,
    deckCount,
  })
  const canDraw = drawReason === null && gs !== undefined && playing
  const current = director.current
  const seats = B.buildSeats({
    gameState: gs ?? null,
    ctx: gameServerState?.ctx ?? null,
    presence,
    selfId: ws.id,
    passedIds: memo.passedIds,
    penalties: current?.type === 'submit-fail' ? memo.penalties : {},
  })
  const players = B.playerSeats(seats)
  const n = gs ? players.length : presence.length
  const observer = isObserver(myPresence?.status, gs?.players, ws.id)
  const winnerId = winnerIdOf(gs?.players)

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
  const endedWinner = director.ended ? (director.ended.winner ?? winner) : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: announce once per release
  useEffect(() => {
    if (endedWinner) {
      announce(`${endedWinner} の勝ち`)
    }
  }, [endedWinner])

  const handleSubmit = () => {
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
    ClientMessenger.submit({ ws, submitCardSet: { submit: submitCardIds, factor: factCardIds } })
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

  const conn = connectionStateOf({
    readyState: ws.readyState,
    roomStatus,
    hasGameState: gameServerState !== null,
    errored: errored.current,
  })
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
    <B.TurnClockContext.Provider value={clock.current}>
      <div
        data-card-size={compSizeOption}
        data-room-status={roomStatus ?? 'unknown'}
        className="h-full"
      >
        <B.ConnectionOverlay state={conn} onReconnect={() => ws.reconnect()}>
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
                onSetReady={() => ClientMessenger.setReady({ ws })}
                onUnsetReady={() => ClientMessenger.unsetReady({ ws })}
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
                    onDraw={mode === 'wide' ? () => ClientMessenger.draw({ ws }) : undefined}
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
                    onDraw={() => ClientMessenger.draw({ ws })}
                    onPass={() => ClientMessenger.pass({ ws })}
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
          onNextRound={() => handleGameStart(gs?.rule)}
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
