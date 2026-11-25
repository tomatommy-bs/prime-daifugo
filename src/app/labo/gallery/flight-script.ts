/**
 * The `flights` gallery scene (spec §10.5, §9.2): one server transition per step, played
 * through the real `classifyTransition` → `planFlights` → `FlightLayer` pipeline so every
 * card flight can be watched (and captured frame by frame by `scripts/flights.mjs`).
 *
 * Every step starts from its own `before` state, so `?scene=flights&play=<step>` replays a
 * single flight deterministically. Pure data: no React.
 */
import type { GameState, SystemMessage } from '@/app/room/[id]/_ui/board/classify-transition'
import type { CardId } from '@/game-card/src'
import {
  CAST,
  type GalleryAction,
  PLAYERS,
  buildCtx,
  buildDeal,
  buildState,
  presenceOf,
  systemMessage,
} from './fixtures'

export const FLIGHT_STEP_IDS = [
  'draw-me',
  'draw-opp',
  'play-me',
  'play-opp',
  'penalty-opp',
  'penalty-me',
  'flow',
  'cut57',
  'deal',
] as const

export type FlightStepId = (typeof FLIGHT_STEP_IDS)[number]

export const isFlightStepId = (v: string | null | undefined): v is FlightStepId =>
  v != null && (FLIGHT_STEP_IDS as readonly string[]).includes(v)

export const FLIGHT_STEP_TITLES: Record<FlightStepId, string> = {
  'draw-me': '引く · 山札 → 手札（頂点で表に）',
  'draw-opp': '相手が引く · 山札 → 席',
  'play-me': '出す · 提出 → 場',
  'play-opp': '相手が出す · 席 → 場',
  'penalty-opp': 'ペナルティ +2 · 山札 → 相手の席',
  'penalty-me': 'ペナルティ +2 · 山札 → 手札',
  flow: '流れ · 場 → 山札（対数螺旋）',
  cut57: '57 — 場が二つに割れる',
  deal: '配る · 山札 → 各席',
}

export type FlightStep = {
  id: FlightStepId
  selfId: string
  before: GameState
  /** cards already in my tray before the step (a play) */
  tray: CardId[]
  next: GameState
  msg: SystemMessage
}

export const FLIGHT_PRESENCE = presenceOf(PLAYERS)

const SELF = CAST.alice.id
const BOB = CAST.bob.id
const CAROL = CAST.carol.id

const HANDS: Record<string, CardId[]> = {
  p1: ['AC', '2H', '4D', '5S', '7H', '8C', '9D', 'JS', 'QH'],
  p2: ['2C', '3H', '6S', '7D', '8S', '9H', 'JD', 'QS'],
  p3: ['4S', '5H', '10C', 'KH', 'AD'],
}
const FIELD: CardId[][] = [['KS']] // 13

/** The UI state alice receives: her hand by id, the others by count only (spec §9.3). */
const state = (
  hands: Record<string, CardId[]>,
  field: CardId[][],
  current: string,
  lead: string | null = CAROL,
): GameState => ({
  gameState: buildState({
    hands,
    field,
    deckTopPlayer: field.length > 0 ? lead : null,
    selfId: SELF,
  }),
  ctx: buildCtx(current, { leftTime: 42 }),
})

const NEXT_OF: Record<string, string> = { [SELF]: BOB, [BOB]: CAROL, [CAROL]: SELF }

const without = (hand: CardId[], cards: CardId[]) => hand.filter((c) => !cards.includes(c))

/** The first `n` cards of the server's deck for this layout (what a draw takes). */
const deckTop = (hands: Record<string, CardId[]>, field: CardId[][], n: number): CardId[] =>
  buildDeal(hands, field).deck.slice(0, n)

const msg = (commander: string, a: GalleryAction): SystemMessage => systemMessage(commander, a)

/** A draw (`fail` unset) or a failed submission of `fail` with an `n`-card penalty. */
function drawStep(id: FlightStepId, who: string, n: number, fail?: CardId[]): FlightStep {
  const before = state(HANDS, FIELD, who)
  const drawn = deckTop(HANDS, FIELD, n)
  // a failed submission keeps the cards in hand and adds the penalty
  const hands = { ...HANDS, [who]: [...HANDS[who], ...drawn] }
  const next = state(hands, FIELD, fail ? NEXT_OF[who] : who)
  return {
    id,
    selfId: SELF,
    before,
    tray: fail && who === SELF ? fail : [],
    next,
    msg: fail
      ? msg(who, { action: 'submit', submit: fail, result: 'BASE_IS_NOT_PRIME' })
      : msg(who, { action: 'draw' }),
  }
}

function playStep(id: FlightStepId, who: string, cards: CardId[], nextPlayer: string): FlightStep {
  const before = state(HANDS, FIELD, who)
  const hands = { ...HANDS, [who]: without(HANDS[who], cards) }
  const next = state(hands, [...FIELD, cards], nextPlayer, who)
  return {
    id,
    selfId: SELF,
    before,
    tray: who === SELF ? cards : [],
    next,
    msg: msg(who, { action: 'submit', submit: cards, result: null }),
  }
}

function flowStep(): FlightStep {
  const field: CardId[][] = [...FIELD, ['10C', 'KH']] // 13 < 1013, carol leads
  const hands = { ...HANDS, p3: without(HANDS.p3, ['10C', 'KH']) }
  const before = state(hands, field, BOB)
  const next = state(hands, [], CAROL)
  return {
    id: 'flow',
    selfId: SELF,
    before,
    tray: [],
    next,
    msg: msg(BOB, { action: 'pass' }),
  }
}

function cut57Step(): FlightStep {
  const cards: CardId[] = ['5S', '7H'] // 57
  const field: CardId[][] = [['4S', '7D']] // 47
  const hands: Record<string, CardId[]> = {
    ...HANDS,
    p3: without(HANDS.p3, ['4S']),
    p2: without(HANDS.p2, ['7D']),
  }
  const before = state(hands, field, SELF, BOB)
  // the server clears the field and the same player leads again
  const next = state({ ...hands, p1: without(hands.p1, cards) }, [], SELF)
  return {
    id: 'cut57',
    selfId: SELF,
    before,
    tray: cards,
    next,
    msg: msg(SELF, { action: 'submit', submit: cards, result: null }),
  }
}

function dealStep(): FlightStep {
  const before = state({ p1: [], p2: [], p3: [] }, [], SELF)
  const next = state(HANDS, [], SELF)
  return {
    id: 'deal',
    selfId: SELF,
    before,
    tray: [],
    next,
    msg: msg(SELF, { action: 'game-start' }),
  }
}

export const FLIGHT_STEPS: Record<FlightStepId, FlightStep> = {
  'draw-me': drawStep('draw-me', SELF, 1),
  'draw-opp': drawStep('draw-opp', BOB, 1),
  'play-me': playStep('play-me', SELF, ['4D', '7H'], BOB), // 47 > 13
  'play-opp': playStep('play-opp', CAROL, ['10C', 'KH'], SELF), // 1013
  'penalty-opp': drawStep('penalty-opp', BOB, 2, ['6S', 'JD']), // 611 = 13 · 47
  'penalty-me': drawStep('penalty-me', SELF, 2, ['2H', 'AC']), // 21 = 3 · 7
  flow: flowStep(),
  cut57: cut57Step(),
  deal: dealStep(),
}
