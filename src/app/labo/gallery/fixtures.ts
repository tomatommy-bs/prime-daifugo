/**
 * Design gallery fixtures (spec §10.5). Mock server state for `/labo/gallery?scene=…`.
 *
 * Every board scene is described the way a client would receive it: the wire messages
 * (`messages`, valid against `serverToClientSchema`), the resulting `GameState` / `Ctx` /
 * presence, and the client-only state (`myField`, passes, the visual event being played).
 * Opponent hands exist in `gameState` exactly as the server sends them, but views only
 * ever receive counts (`SeatModel.handCount`).
 *
 * Pure data: no React, no socket. `fixtures.test.ts` validates every scene.
 */
import type { ConnectionState, LogEntry, SubmitResultView } from '@/app/room/[id]/_ui/board'
import { cardIds as ALL_CARD_IDS, type CardId } from '@/game-card/src'
import type { FactCardId, PrimeDaifugoSetupData } from '@/interface/common'
import type * as serverToClient from '@/interface/server-to-client'
import type { Ctx } from '@/partykit/room/logic/game-rule'
import {
  LAST_SUBMIT_ERROR,
  type PrimeDaifugoGameState,
} from '@/partykit/room/logic/game-rule/game-state'

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
}

/* ------------------------------------------------------------------ */
/* Cast                                                                */
/* ------------------------------------------------------------------ */

type PresenceEntry = serverToClient.PresenceEvent['presence'][number]
type ServerMessage = serverToClient.ChatEvent | serverToClient.PresenceEvent
type WireMessage =
  | ServerMessage
  | serverToClient.RoomStatusEvent
  | serverToClient.SystemEvent
  | serverToClient.LeftTimeEvent

export const ROOM_ID = '1234'

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

export const presenceOf = (
  list: readonly { id: string; name: string }[],
  notReady: string[] = [],
): PresenceEntry[] =>
  list.map(({ id, name }) => ({ id, name, status: notReady.includes(id) ? 'not-ready' : 'ready' }))

const nameOf = (id: string | null): string | null =>
  Object.values(CAST).find((c) => c.id === id)?.name ?? null

/* ------------------------------------------------------------------ */
/* State builders                                                      */
/* ------------------------------------------------------------------ */

/**
 * A full 52-card state: hands and field as given, the rest of the deck in canonical order.
 * Observers are never in `players`.
 */
export function buildState({
  hands,
  field,
  deckTopPlayer,
  drawRight = {},
  lastSubmitError = null,
}: {
  hands: Record<string, CardId[]>
  field: CardId[][]
  deckTopPlayer: string | null
  drawRight?: Record<string, boolean>
  lastSubmitError?: PrimeDaifugoGameState['lastSubmitError']
}): PrimeDaifugoGameState {
  const used = new Set<CardId>([...Object.values(hands).flat(), ...field.flat()])
  const players: PrimeDaifugoGameState['players'] = {}
  for (const [id, hand] of Object.entries(hands)) {
    players[id] = { hand, drawRight: drawRight[id] ?? true }
  }
  return {
    players,
    field,
    deck: ALL_CARD_IDS.filter((c) => !used.has(c)),
    deckTopPlayer,
    lastSubmitError,
    rule: GALLERY_RULE,
  }
}

export function buildCtx(currentPlayer: string, observers: string[] = []): Ctx {
  const playOrder = [...PLAYERS.map((p) => p.id), ...observers]
  return {
    numPlayers: playOrder.length,
    currentPlayer,
    // Known server quirk (§0.7): observers appear in playOrder.
    playOrder,
    activePlayers: Object.fromEntries(
      playOrder.map((id) => [id, observers.includes(id) ? 'observe' : 'play']),
    ) as Ctx['activePlayers'],
  }
}

export type SystemAction =
  | { action: 'game-start' | 'draw' | 'pass' }
  | { action: 'submit'; submit: CardId[]; factor?: FactCardId[]; result: SubmitResult }
  | { action: 'game-end'; winner: string }
type SubmitResult = serverToClient.SubmissionResult['result']

export function systemMessage(
  commanderId: string,
  gameState: PrimeDaifugoGameState,
  ctx: Ctx,
  a: SystemAction,
): serverToClient.SystemEvent {
  const base = {
    event: 'system' as const,
    gameState,
    ctx,
    commander: { id: commanderId, name: nameOf(commanderId) ?? commanderId },
  }
  switch (a.action) {
    case 'submit':
      return {
        ...base,
        action: 'submit',
        submissionResult: {
          submitCardSet: { submit: a.submit, factor: a.factor ?? [] },
          result: a.result,
        },
      }
    case 'game-end':
      return { ...base, action: 'game-end', winner: a.winner }
    default:
      return { ...base, action: a.action }
  }
}

/** `penalty` in the shape the production `buildSeats` takes. */
export const penaltiesOf = (penalty?: { id: string; n: number }): Record<string, number> =>
  penalty ? { [penalty.id]: penalty.n } : {}

/* ------------------------------------------------------------------ */
/* Board scenes                                                        */
/* ------------------------------------------------------------------ */

export type LogLine = { id: string; text: string; kind: NonNullable<LogEntry['kind']> }

export type BoardScene = {
  id: Exclude<SceneId, 'home-parts' | 'waiting'>
  selfId: string
  presence: PresenceEntry[]
  roomStatus: serverToClient.RoomStatusEvent['status']
  /** server state after `messages` */
  gameState: PrimeDaifugoGameState | null
  ctx: Ctx | null
  /** the wire messages that lead to this frame */
  messages: WireMessage[]
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
  live: string | null
  log: LogLine[]
}

const BASE_LOG: LogLine[] = [
  { id: 'l1', text: 'ゲーム開始 · |H₀| = 11', kind: 'system' },
  { id: 'l2', text: 'carol 13 ✓', kind: 'play' },
  { id: 'l3', text: 'alice 47 ✓', kind: 'play' },
  { id: 'l4', text: 'bob 1013 ✓', kind: 'play' },
]

const statusMessages = (
  presence: PresenceEntry[],
  status: serverToClient.RoomStatusEvent['status'],
): WireMessage[] => [
  { event: 'presence', presence },
  { event: 'room-status', status },
]

/* my-turn ----------------------------------------------------------- */

const MY_TURN_FIELD: CardId[][] = [['KS'], ['4D', '7H'], ['10C', 'KH']] // 13 < 47 < 1013
const MY_TURN_HANDS: Record<string, CardId[]> = {
  p1: ['AC', '2H', '3D', '5S', '6H', '8C', '9D', 'JS', 'QH', 'KC'],
  p2: ['2C', '3H', '6S', '7D', '8S', '9H', '10D', 'JD', 'QS'],
  p3: ['4S', '5H', 'AD'],
}

function myTurnScene(): BoardScene {
  const presence = presenceOf(PLAYERS)
  const gameState = buildState({ hands: MY_TURN_HANDS, field: MY_TURN_FIELD, deckTopPlayer: 'p2' })
  const ctx = buildCtx('p1')
  const tray: CardId[] = ['QH', 'KC'] // 1213, judged only by the server
  return {
    id: 'my-turn',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p3', gameState, ctx, { action: 'pass' }),
      { event: 'left-time', leftTime: 42 },
    ],
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
    connection: 'open',
    live: 'あなたの番です',
    log: [...BASE_LOG, { id: 'l5', text: 'carol ∅ パス', kind: 'pass' }],
  }
}

/* opp-turn ---------------------------------------------------------- */

function oppTurnScene(): BoardScene {
  const presence = presenceOf(PLAYERS)
  const played: CardId[] = ['QH', 'KC']
  const field = [...MY_TURN_FIELD, played] // … < 1013 < 1213
  const hands = { ...MY_TURN_HANDS, p1: MY_TURN_HANDS.p1.filter((c) => !played.includes(c)) }
  const gameState = buildState({ hands, field, deckTopPlayer: 'p1' })
  const ctx = buildCtx('p2')
  return {
    id: 'opp-turn',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p1', gameState, ctx, { action: 'submit', submit: played, result: null }),
      { event: 'left-time', leftTime: 8 },
    ],
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: field,
    leftTime: 8,
    passedIds: ['p3'],
    result: null,
    cut57: false,
    gameSet: null,
    connection: 'open',
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
  const presence = presenceOf(PLAYERS)
  const field: CardId[][] = [
    ['2D', '9S'],
    ['5S', '3D'],
  ] // 29 < 53
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '2H', '2S', '4C', '6C', '7D', '9H', 'JH', 'QD'],
    p2: ['3C', '5C', '6D', '8H', '10S', 'AS', 'KD'],
    p3: ['4H', '7S', 'JC', 'QC'],
  }
  const gameState = buildState({ hands, field, deckTopPlayer: 'p3' })
  const ctx = buildCtx('p1')
  const tray: CardId[] = ['JH', '2H'] // 112
  const factCards: FactCardId[] = ['2S', '^', '4C', '*', '7D'] // 2⁴ · 7 = 112
  const inUse = new Set<FactCardId>([...tray, ...factCards])
  return {
    id: 'factor',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p2', gameState, ctx, { action: 'pass' }),
      { event: 'left-time', leftTime: 51 },
    ],
    myField: { hand: hands.p1.filter((c) => !inUse.has(c)), tray, factCards, mode: 'factor' },
    fieldView: field,
    leftTime: 51,
    passedIds: ['p2'],
    result: null,
    cut57: false,
    gameSet: null,
    connection: 'open',
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
  const presence = presenceOf(PLAYERS)
  const field: CardId[][] = [['AH', '2D', '7C']] // 127
  const submitted: CardId[] = ['2C', '2H', 'AD'] // 221 = 13 · 17
  const penaltyCards: CardId[] = ['8D', 'QS', '6S']
  const hands: Record<string, CardId[]> = {
    p1: ['3C', '4H', '5D', '9C', 'JS', 'QH', 'KC', '10H'],
    // the submitted cards came back, plus 3 penalty cards
    p2: ['3S', '7H', ...submitted, ...penaltyCards],
    p3: ['4D', '6H', '8C', 'JD', 'KS'],
  }
  const gameState = buildState({
    hands,
    field,
    deckTopPlayer: 'p3',
    lastSubmitError: LAST_SUBMIT_ERROR.BASE_IS_NOT_PRIME,
  })
  const ctx = buildCtx('p3')
  return {
    id: 'not-prime',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p2', gameState, ctx, {
        action: 'submit',
        submit: submitted,
        result: 'BASE_IS_NOT_PRIME',
      }),
      { event: 'left-time', leftTime: 60 },
    ],
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
    connection: 'open',
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
  const presence = presenceOf(PLAYERS)
  const before: CardId[][] = [['4C', '7S']] // 47
  const played: CardId[] = ['5D', '7D'] // 57
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '3H', '6D', '8S', '9C', 'JH', 'QC'],
    p2: ['2S', '4H', '6C', '10D', 'KH', 'QD'],
    p3: ['3S', '5C', '9D', 'JS'],
  }
  // The server clears the field after a 57 cut; the played cards go back into the deck,
  // and the same player leads again.
  const gameState = buildState({ hands, field: [], deckTopPlayer: null })
  const ctx = buildCtx('p1')
  return {
    id: 'cut57',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p1', gameState, ctx, { action: 'submit', submit: played, result: null }),
    ],
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    // the ceremony plays over the field as it was before the cut
    fieldView: [...before, played],
    leftTime: 60,
    passedIds: [],
    result: null,
    cut57: true,
    gameSet: null,
    connection: 'open',
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
  const presence = presenceOf(PLAYERS)
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '2H', '3D', '5S', '6H', '8C', '9D', 'JS'],
    p2: ['2C', '3H', '6S', '7D', '8S', '9H', '10D'],
    p3: ['4S', '5H', 'AD'],
  }
  // everybody passed: the field flowed into the deck and bob (the lead) starts afresh
  const gameState = buildState({ hands, field: [], deckTopPlayer: null })
  const ctx = buildCtx('p2')
  return {
    id: 'flow',
    selfId: 'p1',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p1', gameState, ctx, { action: 'pass' }),
      { event: 'left-time', leftTime: 60 },
    ],
    myField: { hand: hands.p1, tray: [], factCards: [], mode: 'basic' },
    fieldView: [],
    struckSequence: [13, 47, 1013],
    leftTime: 60,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: null,
    connection: 'open',
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
  const presence = presenceOf(PLAYERS)
  const field: CardId[][] = [['2S'], ['5C'], ['7H']] // bob went out on 7
  const hands: Record<string, CardId[]> = {
    p1: ['AC', '4D', '9S'],
    p2: [],
    p3: ['3H', '6C', '8D', 'JH', 'KS'],
  }
  const gameState = buildState({ hands, field, deckTopPlayer: 'p2' })
  const ctx = buildCtx('p3')
  return {
    id: 'game-set',
    selfId: 'p1',
    presence,
    roomStatus: 'waitingNextRound',
    gameState,
    ctx,
    // the server order the director re-sequences (§0.7): game-end, room-status, submit
    messages: [
      { event: 'presence', presence },
      systemMessage('p2', gameState, ctx, { action: 'game-end', winner: 'bob' }),
      { event: 'room-status', status: 'waitingNextRound' },
      systemMessage('p2', gameState, ctx, { action: 'submit', submit: ['7H'], result: null }),
    ],
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
    connection: 'open',
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
  const presence = presenceOf([...PLAYERS, CAST.dave])
  const gameState = buildState({ hands: MY_TURN_HANDS, field: MY_TURN_FIELD, deckTopPlayer: 'p2' })
  const ctx = buildCtx('p3', ['p4'])
  return {
    id: 'observer',
    selfId: 'p4',
    presence,
    roomStatus: 'playing',
    gameState,
    ctx,
    messages: [
      ...statusMessages(presence, 'playing'),
      systemMessage('p2', gameState, ctx, {
        action: 'submit',
        submit: ['10C', 'KH'],
        result: null,
      }),
      { event: 'left-time', leftTime: 33 },
    ],
    myField: null,
    fieldView: MY_TURN_FIELD,
    leftTime: 33,
    passedIds: [],
    result: null,
    cut57: false,
    gameSet: null,
    connection: 'open',
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
    live: '接続中',
    log: [],
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
} as const satisfies Record<BoardScene['id'], BoardScene>

export type BoardSceneId = keyof typeof BOARD_SCENES

export const isBoardSceneId = (id: SceneId): id is BoardSceneId => id in BOARD_SCENES

/* ------------------------------------------------------------------ */
/* Waiting room and home parts                                         */
/* ------------------------------------------------------------------ */

export const WAITING_SCENE = {
  rule: GALLERY_RULE,
  presence: presenceOf(PLAYERS, ['p3']),
  selfId: 'p1',
  messages: [
    { event: 'presence', presence: presenceOf(PLAYERS, ['p3']) },
    { event: 'room-status', status: 'waiting' },
  ] satisfies WireMessage[],
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
    if (msg.event === 'system' && msg.action === 'submit') {
      for (const c of msg.submissionResult.submitCardSet.submit) {
        visible.add(c)
      }
    }
  }
  return visible
}
