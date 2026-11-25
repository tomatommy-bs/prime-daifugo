/**
 * Design gallery fixtures (spec §10.5). Mock room state for `/labo/gallery?scene=…`.
 *
 * Every board scene is described the way a client receives it over the realtime protocol
 * (rebuild spec §6, §9.3):
 * - `deal`: the server's private card layout (all 52 cards: hands, field, deck). It never
 *   leaves the server; the fixtures keep it only to prove the views are consistent with it.
 * - `view`: the viewer's redacted `View` (own hand by id, every other hand by count).
 * - `messages`: the room frames that lead to this frame (valid against the protocol schemas).
 * - `gameState` / `ctx` / `presence`: the UI shape the board reads (`ClientGameStateBundle`,
 *   `SessionPresence`), projected from the view exactly as the session adapter does.
 * - client-only state: `myField`, passes, the visual event being played, the overlay state.
 *
 * Pure data: no React, no socket. `fixtures.test.ts` validates every scene.
 */
import type { ConnectionState, LogEntry, SubmitResultView } from '@/app/room/[id]/_ui/board'
import type { CloseReason, SessionPresence } from '@/app/room/[id]/session/types'
import { cardIds as ALL_CARD_IDS, type CardId } from '@/game-card/src'
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import type {
  ClientCtx,
  ClientGameState,
  ClientGameStateBundle,
  SystemMessage,
} from '@/shared/client-state'
import { PV } from '@/shared/ids'
import type {
  RoomEvent,
  RoomServerFrame,
  RoomStatus,
  SubmitResultCode,
  View,
} from '@/shared/protocol'

/* ------------------------------------------------------------------ */
/* Scene ids                                                           */
/* ------------------------------------------------------------------ */

export const SCENE_IDS = [
  'home-parts',
  'waiting',
  'my-turn',
  'opp-turn',
  'factor',
  'not-prime',
  'cut57',
  'flow',
  'game-set',
  'observer',
  'connecting',
  'reconnecting-seat',
  'superseded',
] as const

export type SceneId = (typeof SCENE_IDS)[number]

export const isSceneId = (value: string | null | undefined): value is SceneId =>
  value != null && (SCENE_IDS as readonly string[]).includes(value)

/** One-line captions for the gallery index. */
export const SCENE_TITLES: Record<SceneId, string> = {
  'home-parts': 'ホームの部品 · ふるい / ウラムの螺旋 / 数字',
  waiting: '待機室 · ℤ/3ℤ と公理',
  'my-turn': 'あなたの番 · 13 < 47 < 1013',
  'opp-turn': '相手の番 · 残り 8 秒',
  factor: '素因数分解モード · 112 = 2⁴ · 7',
  'not-prime': '失敗 · 221 = 13 · 17',
  cut57: '57 — グロタンディーク素数切り',
  flow: '流れ · k = 自由',
  'game-set': 'GAME SET · Q.E.D. ∎',
  observer: '観戦 · 手札なし',
  connecting: '接続中…',
  'reconnecting-seat': '再接続中 · bob ◌（手番は 20 秒まで）',
  superseded: '別のタブで開かれています',
}

/* ------------------------------------------------------------------ */
/* Cast                                                                */
/* ------------------------------------------------------------------ */

export const ROOM_ID = '1234'

/** The server clock of every gallery frame (deadlines are relative to it). */
export const GALLERY_NOW = 1_700_000_000_000
const GALLERY_EPOCH = 'gallery'
const GALLERY_TURN = 7

export const GALLERY_RULE: PrimeDaifugoSetupData = {
  initNumCards: 11,
  maxSubmitNumCards: 4,
  timeLimit: 60,
  halfEvenNumbers: false,
}

export const CAST = {
  alice: { id: 'p1', name: 'alice' },
  bob: { id: 'p2', name: 'bob' },
  carol: { id: 'p3', name: 'carol' },
  dave: { id: 'p4', name: 'dave' },
} as const

export const PLAYERS = [CAST.alice, CAST.bob, CAST.carol]

type CastMember = { id: string; name: string }

/** `SessionPresence` for a cast list: players, connected; `notReady` ids are not ready. */
export const presenceOf = (
  list: readonly CastMember[],
  notReady: string[] = [],
): SessionPresence[] =>
  list.map(({ id, name }) => ({
    id,
    name,
    status: notReady.includes(id) ? 'not-ready' : 'ready',
    role: 'player',
    connected: true,
  }))

const nameOf = (id: string | null): string | null =>
  Object.values(CAST).find((c) => c.id === id)?.name ?? null

/* ------------------------------------------------------------------ */
/* State builders                                                      */
/* ------------------------------------------------------------------ */

/** The server's private layout: hands and field as given, the rest of the deck in order. */
export type Deal = {
  hands: Record<string, CardId[]>
  field: CardId[][]
  deck: CardId[]
}

export function buildDeal(hands: Record<string, CardId[]>, field: CardId[][]): Deal {
  const used = new Set<CardId>([...Object.values(hands).flat(), ...field.flat()])
  return { hands, field, deck: ALL_CARD_IDS.filter((c) => !used.has(c)) }
}

/**
 * The UI game state as `selfId` sees it (spec §9.3): own hand by id, every other hand `[]`
 * with its `handCount`, and the deck by count. Observers are never in `players`.
 */
export function buildState({
  hands,
  field,
  deckTopPlayer,
  selfId,
  drawRight = {},
  lastSubmitError = null,
  winner = null,
}: {
  hands: Record<string, CardId[]>
  field: CardId[][]
  deckTopPlayer: string | null
  selfId: string
  drawRight?: Record<string, boolean>
  lastSubmitError?: SubmitResultCode | null
  winner?: string | null
}): ClientGameState {
  const deal = buildDeal(hands, field)
  const players: ClientGameState['players'] = {}
  for (const [id, hand] of Object.entries(hands)) {
    players[id] = {
      hand: id === selfId ? hand : [],
      handCount: hand.length,
      drawRight: drawRight[id] ?? true,
    }
  }
  return {
    players,
    field,
    deckCount: deal.deck.length,
    deckTopPlayer,
    rule: GALLERY_RULE,
    winner,
    lastSubmitError,
  }
}

/** Ctx with the three players in seat order (observers are never in `playOrder`). */
export function buildCtx(
  currentPlayer: string,
  { leftTime = null }: { leftTime?: number | null } = {},
): ClientCtx {
  return {
    currentPlayer,
    playOrder: PLAYERS.map((p) => p.id),
    turn: GALLERY_TURN,
    deadline: leftTime === null ? null : GALLERY_NOW + leftTime * 1000,
  }
}

/** The UI bundle for `selfId` from a wire view: what the session adapter (`viewToBundle`) does. */
export function bundleOfView(view: View, selfId: string): ClientGameStateBundle | null {
  const g = view.game
  if (g === null) {
    return null
  }
  const players: ClientGameState['players'] = {}
  for (const [id, p] of Object.entries(g.players)) {
    players[id] = {
      hand: id === selfId ? g.hand : [],
      handCount: p.handCount,
      drawRight: p.drawRight,
    }
  }
  return {
    gameState: {
      players,
      field: g.field,
      deckCount: g.deckCount,
      deckTopPlayer: g.deckTopPlayer,
      rule: view.rule,
      winner: g.winner?.id ?? null,
      lastSubmitError: g.lastResult,
    },
    ctx: {
      currentPlayer: g.currentPlayer,
      playOrder: g.playOrder,
      turn: g.turn,
      deadline: g.deadline,
    },
  }
}

/** Session presence from the view's members (`ready` → status). */
export const presenceOfView = (view: View): SessionPresence[] =>
  view.members.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.ready ? 'ready' : 'not-ready',
    role: m.role,
    connected: m.connected,
  }))

export type GalleryAction =
  | { action: 'game-start' | 'draw' }
  | { action: 'pass'; reason?: 'manual' | 'timeout' }
  | {
      action: 'submit'
      submit: CardId[]
      factor?: FactCardId[]
      result: SubmitResultCode | null
    }
  | { action: 'game-end'; winner: string }

/** The game message the director animates, as the session adapter builds it (spec §9.2). */
export function systemMessage(commanderId: string, a: GalleryAction): SystemMessage {
  const commander = { id: commanderId, name: nameOf(commanderId) ?? commanderId }
  switch (a.action) {
    case 'submit':
      return {
        action: 'submit',
        commander,
        submissionResult: {
          submitCardSet: { submit: a.submit, factor: a.factor ?? [] },
          result: a.result,
        },
      }
    case 'pass':
      return { action: 'pass', commander, reason: a.reason ?? 'manual' }
    case 'game-end':
      return { action: 'game-end', winner: a.winner, winnerId: commanderId }
    default:
      return { action: a.action, commander }
  }
}

/** `penalty` in the shape the production `buildSeats` takes. */
export const penaltiesOf = (penalty?: { id: string; n: number }): Record<string, number> =>
  penalty ? { [penalty.id]: penalty.n } : {}

/* ------------------------------------------------------------------ */
/* Wire frames                                                         */
/* ------------------------------------------------------------------ */

type FrameSpec = {
  selfId: string
  /** every member, in join order (players first) */
  members: readonly CastMember[]
  observers?: string[]
  offline?: string[]
  notReady?: string[]
  status: RoomStatus
  hands: Record<string, CardId[]>
  field: CardId[][]
  deckTopPlayer: string | null
  current: string
  leftTime: number | null
  drawRight?: Record<string, boolean>
  lastResult?: SubmitResultCode | null
  winner?: CastMember | null
  /** the events that led to this frame, oldest first */
  events: RoomEvent[]
  /** a terminal `bye` after the events */
  bye?: 'superseded' | 'room-gone'
}

type Frame = {
  deal: Deal
  view: View
  gameState: ClientGameState
  ctx: ClientCtx
  presence: SessionPresence[]
  messages: RoomServerFrame[]
}

/** First version of a gallery frame's replay. */
const BASE_VERSION = 40

function buildFrame(spec: FrameSpec): Frame {
  const deal = buildDeal(spec.hands, spec.field)
  const observers = spec.observers ?? []
  const offline = spec.offline ?? []
  const notReady = spec.notReady ?? []
  const lastSeq = BASE_VERSION + spec.events.length - 1
  const view: View = {
    roomId: ROOM_ID,
    status: spec.status,
    rule: GALLERY_RULE,
    version: lastSeq,
    members: spec.members.map(({ id, name }) => ({
      id,
      name,
      ready: !notReady.includes(id),
      role: observers.includes(id) ? 'observer' : 'player',
      connected: !offline.includes(id),
    })),
    game: {
      round: 1,
      turn: GALLERY_TURN,
      playOrder: PLAYERS.map((p) => p.id),
      currentPlayer: spec.current,
      players: Object.fromEntries(
        Object.entries(deal.hands).map(([id, hand]) => [
          id,
          { handCount: hand.length, drawRight: spec.drawRight?.[id] ?? true },
        ]),
      ),
      hand: deal.hands[spec.selfId] ?? [],
      field: deal.field,
      deckCount: deal.deck.length,
      deckTopPlayer: spec.deckTopPlayer,
      deadline:
        spec.status === 'playing'
          ? GALLERY_NOW + (spec.leftTime ?? GALLERY_RULE.timeLimit) * 1000
          : null,
      winner: spec.winner ?? null,
      lastResult: spec.lastResult ?? null,
    },
  }
  const bundle = bundleOfView(view, spec.selfId) as ClientGameStateBundle
  // a reconnect replay: welcome, then every missed event with the viewer's post-state view
  const messages: RoomServerFrame[] = [
    {
      t: 'welcome',
      pv: PV,
      selfId: spec.selfId,
      epoch: GALLERY_EPOCH,
      serverNow: GALLERY_NOW,
      mode: 'replay',
      seq: lastSeq,
    },
    ...spec.events.map(
      (e, i): RoomServerFrame => ({
        t: 'evt',
        seq: BASE_VERSION + i,
        serverNow: GALLERY_NOW,
        e,
        snap: { ...view, version: BASE_VERSION + i },
      }),
    ),
    ...(spec.bye ? [{ t: 'bye', reason: spec.bye } satisfies RoomServerFrame] : []),
  ]
  return {
    deal,
    view,
    gameState: bundle.gameState,
    ctx: bundle.ctx,
    presence: presenceOfView(view),
    messages,
  }
}

const passed = (by: string, flowed = false): RoomEvent => ({
  type: 'passed',
  by,
  reason: 'manual',
  flowed,
})

const submitted = (
  by: string,
  submit: CardId[],
  {
    factor = [],
    result = null,
    cut57 = false,
    flowed = false,
    penalty = 0,
  }: {
    factor?: FactCardId[]
    result?: SubmitResultCode | null
    cut57?: boolean
    flowed?: boolean
    penalty?: number
  } = {},
): RoomEvent => ({ type: 'submitted', by, submit, factor, result, cut57, flowed, penalty })

/* ------------------------------------------------------------------ */
/* Board scenes                                                        */
/* ------------------------------------------------------------------ */

export type LogLine = { id: string; text: string; kind: NonNullable<LogEntry['kind']> }

export type BoardScene = {
  id: Exclude<SceneId, 'home-parts' | 'waiting'>
  selfId: string
  presence: SessionPresence[]
  roomStatus: RoomStatus
  /** the server's private layout (never sent); null before the first state */
  deal: Deal | null
  /** the viewer's redacted view after `messages` */
  view: View | null
  /** UI game state projected from `view` (own hand by id, others by count) */
  gameState: ClientGameState | null
  ctx: ClientCtx | null
  /** the room frames that lead to this frame */
  messages: RoomServerFrame[]
  /** client-side split of the self hand (`useMyField`) */
  myField: {
    hand: CardId[]
    tray: CardId[]
    factCards: FactCardId[]
    mode: 'basic' | 'factor'
  } | null
  /** what the field shows during the visual event (the director may lag the state) */
  fieldView: CardId[][]
  /** the previous sequence, struck through after a flow */
  struckSequence?: number[]
  leftTime: number | null
  passedIds: string[]
  penalty?: { id: string; n: number }
  freshIds?: CardId[]
  result: SubmitResultView | null
  cut57: boolean
  gameSet: { winner: string; standings: { name: string; handCount: number }[] } | null
  connection: ConnectionState
  /** why the session ended for good (`ConnectionOverlay reason`) */
  closeReason: CloseReason
  live: string | null
  log: LogLine[]
}

/** The scene fields every open, playing frame shares. */
const OPEN = { connection: 'open', closeReason: null } as const

const BASE_LOG: LogLine[] = [
  { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
  { id: 'l2', text: 'carol 13 ✓', kind: 'play' },
  { id: 'l3', text: 'alice 47 ✓', kind: 'play' },
  { id: 'l4', text: 'bob 1013 ✓', kind: 'play' },
]

/* my-turn ----------------------------------------------------------- */

const MY_TURN_FIELD: CardId[][] = [['KS'], ['4D', '7H'], ['10C', 'KH']] // 13 < 47 < 1013
const MY_TURN_HANDS: Record<string, CardId[]> = {
  p1: ['AC', '2H', '3D', '5S', '6H', '8C', '9D', 'JS', 'QH', 'KC'],
  p2: ['2C', '3H', '6S', '7D', '8S', '9H', '10D', 'JD', 'QS'],
  p3: ['4S', '5H', 'AD'],
}

function myTurnScene(): BoardScene {
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands: MY_TURN_HANDS,
    field: MY_TURN_FIELD,
    deckTopPlayer: 'p2',
    current: 'p1',
    leftTime: 42,
    events: [passed('p3')],
  })
  const tray: CardId[] = ['QH', 'KC'] // 1213, judged only by the server
  return {
    id: 'my-turn',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: {
      hand: MY_TURN_HANDS.p1.filter((c) => !tray.includes(c)),
      tray,
      factCards: [],
      mode: 'basic',
    },
    fieldView: MY_TURN_FIELD,
    leftTime: 42,
    passedIds: ['p3'],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: 'あなたの番です',
    log: [...BASE_LOG, { id: 'l5', text: 'carol ∅ パス', kind: 'pass' }],
  }
}

/* opp-turn ---------------------------------------------------------- */

const OPP_PLAYED: CardId[] = ['QH', 'KC']
const OPP_FIELD = [...MY_TURN_FIELD, OPP_PLAYED] // … < 1013 < 1213
const OPP_HANDS = {
  ...MY_TURN_HANDS,
  p1: MY_TURN_HANDS.p1.filter((c) => !OPP_PLAYED.includes(c)),
}

function oppTurnScene(): BoardScene {
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands: OPP_HANDS,
    field: OPP_FIELD,
    deckTopPlayer: 'p1',
    current: 'p2',
    leftTime: 8,
    events: [submitted('p1', OPP_PLAYED)],
  })
  return {
    id: 'opp-turn',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: OPP_HANDS.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: OPP_FIELD,
    leftTime: 8,
    passedIds: ['p3'],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: null,
    log: [
      ...BASE_LOG,
      { id: 'l5', text: 'carol ∅ パス', kind: 'pass' },
      { id: 'l6', text: 'alice 1213 ✓', kind: 'play' },
    ],
  }
}

/* factor ------------------------------------------------------------ */

function factorScene(): BoardScene {
  const field: CardId[][] = [
    ['2D', '9S'],
    ['5S', '3D'],
  ] // 29 < 53
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '2H', '2S', '4C', '6C', '7D', '9H', 'JH', 'QD'],
    p2: ['3C', '5C', '6D', '8H', '10S', 'AS', 'KD'],
    p3: ['4H', '7S', 'JC', 'QC'],
  }
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands,
    field,
    deckTopPlayer: 'p3',
    current: 'p1',
    leftTime: 51,
    events: [passed('p2')],
  })
  const tray: CardId[] = ['JH', '2H'] // 112
  const factCards: FactCardId[] = ['2S', '^', '4C', '*', '7D'] // 2⁴ · 7 = 112
  const inUse = new Set<FactCardId>([...tray, ...factCards])
  return {
    id: 'factor',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: hands.p1.filter((c) => !inUse.has(c)), tray, factCards, mode: 'factor' },
    fieldView: field,
    leftTime: 51,
    passedIds: ['p2'],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: 'あなたの番です',
    log: [
      { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
      { id: 'l2', text: 'alice 29 ✓', kind: 'play' },
      { id: 'l3', text: 'carol 53 ✓', kind: 'play' },
      { id: 'l4', text: 'bob ∅ パス', kind: 'pass' },
    ],
  }
}

/* not-prime --------------------------------------------------------- */

function notPrimeScene(): BoardScene {
  const field: CardId[][] = [['AH', '2D', '7C']] // 127
  const submit: CardId[] = ['2C', '2H', 'AD'] // 221 = 13 · 17
  const penaltyCards: CardId[] = ['8D', 'QS', '6S']
  const hands: Record<string, CardId[]> = {
    p1: ['3C', '4H', '5D', '9C', 'JS', 'QH', 'KC', '10H'],
    // the submitted cards came back, plus 3 penalty cards
    p2: ['3S', '7H', ...submit, ...penaltyCards],
    p3: ['4D', '6H', '8C', 'JD', 'KS'],
  }
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands,
    field,
    deckTopPlayer: 'p3',
    current: 'p3',
    leftTime: 60,
    lastResult: 'BASE_IS_NOT_PRIME',
    events: [submitted('p2', submit, { result: 'BASE_IS_NOT_PRIME', penalty: 3 })],
  })
  return {
    id: 'not-prime',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: field,
    leftTime: 60,
    passedIds: [],
    penalty: { id: 'p2', n: 3 },
    result: {
      kind: 'BASE_IS_NOT_PRIME',
      value: 221,
      penalty: 3,
      submitter: 'bob',
    },
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: 'bob 221 は素数ではありません · +3 枚',
    log: [
      { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
      { id: 'l2', text: 'carol 127 ✓', kind: 'play' },
      { id: 'l3', text: 'alice ∅ パス', kind: 'pass' },
      { id: 'l4', text: 'bob 221 ✗ = 13 · 17 · +3 枚', kind: 'fail' },
    ],
  }
}

/* cut57 ------------------------------------------------------------- */

function cut57Scene(): BoardScene {
  const before: CardId[][] = [['4C', '7S']] // 47
  const played: CardId[] = ['5D', '7D'] // 57
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '3H', '6D', '8S', '9C', 'JH', 'QC'],
    p2: ['2S', '4H', '6C', '10D', 'KH', 'QD'],
    p3: ['3S', '5C', '9D', 'JS'],
  }
  // The server clears the field after a 57 cut; the played cards go back into the deck,
  // and the same player leads again.
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands,
    field: [],
    deckTopPlayer: null,
    current: 'p1',
    leftTime: 60,
    events: [submitted('p1', played, { cut57: true, flowed: true })],
  })
  return {
    id: 'cut57',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    // the ceremony plays over the field as it was before the cut
    fieldView: [...before, played],
    leftTime: 60,
    passedIds: [],
    result: null,
    cut57: true,
    gameSet: null,
    ...OPEN,
    live: '57 グロタンディーク素数切り · もう一度',
    log: [
      { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
      { id: 'l2', text: 'bob 47 ✓', kind: 'play' },
      { id: 'l3', text: 'alice 57 ✓ · グロタンディーク素数切り', kind: 'play' },
    ],
  }
}

/* flow -------------------------------------------------------------- */

function flowScene(): BoardScene {
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '2H', '3D', '5S', '6H', '8C', '9D', 'JS'],
    p2: ['2C', '3H', '6S', '7D', '8S', '9H', '10D'],
    p3: ['4S', '5H', 'AD'],
  }
  // everybody passed: the field flowed into the deck and bob (the lead) starts afresh
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'playing',
    hands,
    field: [],
    deckTopPlayer: null,
    current: 'p2',
    leftTime: 60,
    events: [passed('p1', true)],
  })
  return {
    id: 'flow',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: [],
    struckSequence: [13, 47, 1013],
    leftTime: 60,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: '流れ · k = 自由',
    log: [
      ...BASE_LOG,
      { id: 'l5', text: 'carol ∅ パス', kind: 'pass' },
      { id: 'l6', text: 'alice ∅ パス', kind: 'pass' },
      { id: 'l7', text: '流れ', kind: 'system' },
    ],
  }
}

/* game-set ---------------------------------------------------------- */

function gameSetScene(): BoardScene {
  const field: CardId[][] = [['2S'], ['5C'], ['7H']] // bob went out on 7
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '4D', '9S'],
    p2: [],
    p3: ['3H', '6C', '8D', 'JH', 'KS'],
  }
  // a winning submit emits `submitted` then `game-ended`, both with the final view (§6.4)
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    status: 'waitingNextRound',
    hands,
    field,
    deckTopPlayer: 'p2',
    current: 'p3',
    leftTime: null,
    winner: CAST.bob,
    events: [
      submitted('p2', ['7H']),
      { type: 'game-ended', winnerId: 'p2', winnerName: 'bob', reason: 'empty-hand' },
    ],
  })
  return {
    id: 'game-set',
    selfId: 'p1',
    roomStatus: 'waitingNextRound',
    ...frame,
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: field,
    leftTime: null,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: {
      winner: 'bob',
      standings: [
        { name: 'alice', handCount: 3 },
        { name: 'bob', handCount: 0 },
        { name: 'carol', handCount: 5 },
      ],
    },
    ...OPEN,
    live: 'bob の勝ち',
    log: [
      { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
      { id: 'l2', text: 'alice 2 ✓', kind: 'play' },
      { id: 'l3', text: 'carol 5 ✓', kind: 'play' },
      { id: 'l4', text: 'bob 7 ✓', kind: 'play' },
      { id: 'l5', text: 'bob の勝ち · |H_bob| = 0 ∎', kind: 'end' },
    ],
  }
}

/* observer ---------------------------------------------------------- */

function observerScene(): BoardScene {
  const frame = buildFrame({
    selfId: 'p4',
    members: [...PLAYERS, CAST.dave],
    observers: ['p4'],
    status: 'playing',
    hands: MY_TURN_HANDS,
    field: MY_TURN_FIELD,
    deckTopPlayer: 'p2',
    current: 'p3',
    leftTime: 33,
    events: [submitted('p2', ['10C', 'KH'])],
  })
  return {
    id: 'observer',
    selfId: 'p4',
    roomStatus: 'playing',
    ...frame,
    myField: null,
    fieldView: MY_TURN_FIELD,
    leftTime: 33,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: null,
    log: BASE_LOG,
  }
}

/* connecting -------------------------------------------------------- */

function connectingScene(): BoardScene {
  return {
    id: 'connecting',
    selfId: 'p1',
    presence: [],
    roomStatus: 'playing',
    deal: null,
    view: null,
    gameState: null,
    ctx: null,
    messages: [],
    myField: null,
    fieldView: [],
    leftTime: null,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: null,
    connection: 'connecting',
    closeReason: null,
    live: '接続中',
    log: [],
  }
}

/* reconnecting-seat ------------------------------------------------- */

function reconnectingSeatScene(): BoardScene {
  // bob's socket dropped on his turn: his seat waits (◌) and his turn is capped at 20 s
  const frame = buildFrame({
    selfId: 'p1',
    members: PLAYERS,
    offline: ['p2'],
    status: 'playing',
    hands: OPP_HANDS,
    field: OPP_FIELD,
    deckTopPlayer: 'p1',
    current: 'p2',
    leftTime: 17,
    events: [submitted('p1', OPP_PLAYED), { type: 'presence' }],
  })
  return {
    id: 'reconnecting-seat',
    selfId: 'p1',
    roomStatus: 'playing',
    ...frame,
    myField: { hand: OPP_HANDS.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: OPP_FIELD,
    leftTime: 17,
    passedIds: ['p3'],
    result: null,
    cut57: false,
    gameSet: null,
    ...OPEN,
    live: null,
    log: [
      ...BASE_LOG,
      { id: 'l5', text: 'carol ∅ パス', kind: 'pass' },
      { id: 'l6', text: 'alice 1213 ✓', kind: 'play' },
    ],
  }
}

/* superseded -------------------------------------------------------- */

function supersededScene(): BoardScene {
  // the same seat opened in another tab: this one got bye{superseded} (4001) and stays put
  return {
    ...myTurnScene(),
    id: 'superseded',
    ...buildFrame({
      selfId: 'p1',
      members: PLAYERS,
      status: 'playing',
      hands: MY_TURN_HANDS,
      field: MY_TURN_FIELD,
      deckTopPlayer: 'p2',
      current: 'p1',
      leftTime: 42,
      events: [passed('p3')],
      bye: 'superseded',
    }),
    connection: 'closed',
    closeReason: 'superseded',
    live: null,
  }
}

export const BOARD_SCENES = {
  'my-turn': myTurnScene(),
  'opp-turn': oppTurnScene(),
  factor: factorScene(),
  'not-prime': notPrimeScene(),
  cut57: cut57Scene(),
  flow: flowScene(),
  'game-set': gameSetScene(),
  observer: observerScene(),
  connecting: connectingScene(),
  'reconnecting-seat': reconnectingSeatScene(),
  superseded: supersededScene(),
} as const satisfies Record<BoardScene['id'], BoardScene>

export type BoardSceneId = keyof typeof BOARD_SCENES

export const isBoardSceneId = (id: SceneId): id is BoardSceneId => id in BOARD_SCENES

/* ------------------------------------------------------------------ */
/* Waiting room and home parts                                         */
/* ------------------------------------------------------------------ */

const WAITING_VIEW: View = {
  roomId: ROOM_ID,
  status: 'waiting',
  rule: GALLERY_RULE,
  version: 3,
  members: presenceOf(PLAYERS, ['p3']).map((p) => ({
    id: p.id,
    name: p.name,
    ready: p.status === 'ready',
    role: p.role,
    connected: p.connected,
  })),
  game: null,
}

export const WAITING_SCENE = {
  rule: GALLERY_RULE,
  presence: presenceOfView(WAITING_VIEW),
  selfId: 'p1',
  view: WAITING_VIEW,
  messages: [
    {
      t: 'welcome',
      pv: PV,
      selfId: 'p1',
      epoch: GALLERY_EPOCH,
      serverNow: GALLERY_NOW,
      mode: 'snapshot',
      seq: WAITING_VIEW.version,
      snap: WAITING_VIEW,
    },
  ] satisfies RoomServerFrame[],
} as const

export const HOME_PARTS = {
  counters: { online: 42, lobby: 17, rooms: 6 },
  /** 221 = 13 · 17, shown as a post-result factor tree */
  factorValue: 221,
  factors: [13, 17],
  expr: ['2S', '^', '3C', '*', '3H'] as FactCardId[],
  modRing: 12,
} as const

/** Every card id a view of `scene` may legitimately show as a face. */
export function visibleCardIds(scene: BoardScene): Set<CardId> {
  const visible = new Set<CardId>(scene.fieldView.flat())
  if (scene.myField) {
    for (const c of [...scene.myField.hand, ...scene.myField.tray, ...scene.myField.factCards]) {
      if (c !== '*' && c !== '^') {
        visible.add(c)
      }
    }
  }
  for (const msg of scene.messages) {
    if (msg.t === 'evt' && msg.e.type === 'submitted') {
      for (const c of msg.e.submit) {
        visible.add(c)
      }
    }
  }
  return visible
}
