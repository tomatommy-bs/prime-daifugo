/**
 * Card flights (§9.2 #7 deal, #11 draw, #19 play, #23 penalty, #24 flow, #25 cut): a pure
 * plan of which card flies from where to where, derived from the director's BoardEvents
 * and the two server states. `FlightLayer` resolves the anchors on screen (measured FLIP)
 * and animates transform-only ghosts along the paths from `@/design/math/geometry`.
 *
 * Nothing here touches game state: the state is already applied, flights only *show* how
 * it changed, and the real cards they land on are merely transparent meanwhile.
 */
import { type Bezier, DUR, EASE, stagger } from '@/design/motion'
import type { CardId } from '@/game-card/src'
import type { GameState } from './classify-transition'
import type { BoardEvent } from './types'

/** Where a flight starts or ends; resolved to a DOM element by `FlightLayer`. */
export type FlightAnchor =
  | { kind: 'deck' }
  /** a seat chip / node (`data-seat-anchor`) */
  | { kind: 'seat'; id: string }
  /** a card anywhere (hand, tray, fact tray, field): sources only */
  | { kind: 'card'; card: CardId }
  /** a card in my hand (`data-anchor="hand"`) */
  | { kind: 'hand-card'; card: CardId }
  /** a card on the field top (`data-field-top`) */
  | { kind: 'field-card'; card: CardId }
  /** a card of the 57 cut overlay (`data-cut-card`) */
  | { kind: 'cut-card'; card: CardId }
  | { kind: 'field' }
  | { kind: 'hand' }

export type FlightFace = CardId | 'Back'

export type FlightSpec = {
  /** unique within one plan */
  key: string
  from: FlightAnchor
  to: FlightAnchor
  /** used when `to` is not on screen */
  fallback?: FlightAnchor
  path: 'arc' | 'spiral'
  /** face shown at take-off */
  face: FlightFace
  /** face shown on landing; a different face flips at the apex */
  faceTo: FlightFace
  /** seconds */
  delay: number
  /** seconds */
  duration: number
  ease: Bezier
  /** the real target card stays transparent until the ghost lands */
  hideTarget: boolean
  /** shrink and fade into the target (seats, the deck sweep) instead of landing on a card */
  absorb: boolean
}

/** At most this many cards fly at once (§9.1); beyond that the plan is truncated. */
export const MAX_FLIGHTS = 24
/** play / flow stagger between the cards of one group (§9.2 #19, #24) */
export const GROUP_STAGGER = 0.034
/** the penalty draw waits until the submitted cards have gone back (§9.2 #20 → #23) */
export const PENALTY_DELAY = DUR.lg

export type FlightContext = {
  selfId: string
  prev: GameState | null
  next: GameState
}

/** Card ids in `id`'s hand: only self's hand carries ids (others are `[]`, spec §9.3). */
const handOf = (s: GameState | null, id: string): CardId[] => s?.gameState.players[id]?.hand ?? []
const handCountOf = (s: GameState | null, id: string): number =>
  s?.gameState.players[id]?.handCount ?? 0

/**
 * Cards that are in `next`'s hand of `id` but were not in `prev`'s (an id diff). Only self's
 * hand carries ids, so this is `[]` for every other player: use `arrivedCount` for them.
 */
export function arrivedCards(prev: GameState | null, next: GameState, id: string): CardId[] {
  const before = new Set(handOf(prev, id))
  return handOf(next, id).filter((c) => !before.has(c))
}

/**
 * How many cards just reached `id`'s hand: the id diff for self, the `handCount` delta for
 * everyone else (never negative).
 */
export function arrivedCount(
  prev: GameState | null,
  next: GameState,
  id: string,
  selfId: string,
): number {
  if (id === selfId) {
    return arrivedCards(prev, next, id).length
  }
  return Math.max(0, handCountOf(next, id) - handCountOf(prev, id))
}

const deckToSeat = (key: string, id: string, delay: number, duration = DUR.lg): FlightSpec => ({
  key,
  from: { kind: 'deck' },
  to: { kind: 'seat', id },
  path: 'arc',
  face: 'Back',
  faceTo: 'Back',
  delay,
  duration,
  ease: EASE.inOut,
  hideTarget: false,
  absorb: true,
})

const deckToHand = (card: CardId, delay: number, duration = DUR.lg): FlightSpec => ({
  key: `draw-${card}`,
  from: { kind: 'deck' },
  to: { kind: 'hand-card', card },
  fallback: { kind: 'hand' },
  path: 'arc',
  face: 'Back',
  faceTo: card,
  delay,
  duration,
  ease: EASE.inOut,
  hideTarget: true,
  absorb: false,
})

/** Backs to a seat (others) or face-up cards into my hand (self). */
function drawFlights(
  playerId: string,
  cards: CardId[],
  count: number,
  ctx: FlightContext,
  delay: number,
  prefix: string,
): FlightSpec[] {
  const each = stagger(count, GROUP_STAGGER * 2)
  if (playerId === ctx.selfId) {
    return cards.map((card, i) => deckToHand(card, delay + i * each))
  }
  return Array.from({ length: count }, (_, i) =>
    deckToSeat(`${prefix}-${playerId}-${i}`, playerId, delay + i * each),
  )
}

/** The played cards: from my tray (self) or the submitter's seat (others) to the field. */
function playFlights(
  playerId: string,
  cards: CardId[],
  ctx: FlightContext,
  target: 'field-card' | 'cut-card',
  delay = 0,
): FlightSpec[] {
  const mine = playerId === ctx.selfId
  return cards.map((card, i) => ({
    key: `play-${card}`,
    from: mine ? { kind: 'card', card } : { kind: 'seat', id: playerId },
    to: { kind: target, card },
    fallback: { kind: 'field' },
    path: 'arc',
    face: mine ? card : 'Back',
    faceTo: card,
    delay: delay + i * GROUP_STAGGER,
    duration: DUR.lg,
    ease: EASE.inOut,
    hideTarget: true,
    absorb: false,
  }))
}

/** The field top sweeps into the deck along a logarithmic spiral (#24). */
function flowFlights(prev: GameState | null, delay = 0): FlightSpec[] {
  const top = prev?.gameState.field.at(-1) ?? []
  return top.map((card, i) => ({
    key: `flow-${card}`,
    from: { kind: 'field-card', card },
    to: { kind: 'deck' },
    path: 'spiral',
    face: card,
    faceTo: card,
    delay: delay + i * GROUP_STAGGER,
    duration: DUR.lg,
    ease: EASE.in,
    hideTarget: false,
    absorb: true,
  }))
}

/** Deck → seats round-robin (#7). My cards land face-up in my hand; at most MAX_FLIGHTS. */
function dealFlights(ctx: FlightContext): FlightSpec[] {
  const order = ctx.next.ctx.playOrder.filter((id) => ctx.next.gameState.players[id] !== undefined)
  if (order.length === 0) {
    return []
  }
  const mine = handOf(ctx.next, ctx.selfId).slice(0, MAX_FLIGHTS)
  const others = order.filter((id) => id !== ctx.selfId)
  const perOther =
    others.length > 0 ? Math.floor(Math.max(0, MAX_FLIGHTS - mine.length) / others.length) : 0
  const quota = (id: string) =>
    id === ctx.selfId ? mine.length : Math.min(handCountOf(ctx.next, id), perOther)
  const rounds = Math.max(0, ...order.map(quota))
  const slots: { id: string; r: number }[] = []
  for (let r = 0; r < rounds; r++) {
    for (const id of order) {
      if (r < quota(id)) {
        slots.push({ id, r })
      }
    }
  }
  const each = stagger(slots.length, 0.055, 1.2 - DUR.lg)
  return slots.map(({ id, r }, i) =>
    id === ctx.selfId ? deckToHand(mine[r], i * each) : deckToSeat(`deal-${id}-${r}`, id, i * each),
  )
}

const endOf = (flights: FlightSpec[]) =>
  flights.reduce((t, f) => Math.max(t, f.delay + f.duration), 0)

/** Flights for one event, starting at `offset` seconds. */
export function flightsFor(e: BoardEvent, ctx: FlightContext, offset = 0): FlightSpec[] {
  switch (e.type) {
    case 'deal':
      return dealFlights(ctx).map((f) => ({ ...f, delay: f.delay + offset }))
    case 'draw': {
      const cards = arrivedCards(ctx.prev, ctx.next, e.playerId)
      const count = arrivedCount(ctx.prev, ctx.next, e.playerId, ctx.selfId)
      return drawFlights(e.playerId, cards, Math.max(1, count), ctx, offset, 'draw')
    }
    case 'submit-ok':
      return playFlights(e.playerId, e.cards, ctx, 'field-card', offset)
    case 'cut57':
      // the previous top sweeps away while the 57 lands; then the slash cleaves it
      return [
        ...flowFlights(ctx.prev, offset),
        ...playFlights(e.playerId, e.cards, ctx, 'cut-card', offset),
      ]
    case 'submit-fail': {
      if (e.penalty <= 0) {
        return []
      }
      const cards = arrivedCards(ctx.prev, ctx.next, e.playerId)
      return drawFlights(e.playerId, cards, e.penalty, ctx, offset + PENALTY_DELAY, 'penalty')
    }
    case 'flow':
      return flowFlights(ctx.prev, offset)
    default:
      return []
  }
}

/**
 * Every flight for the events of one server message, in play order: an event's flights
 * start once the previous event's have landed. Truncated to `MAX_FLIGHTS`.
 */
export function planFlights(events: BoardEvent[], ctx: FlightContext): FlightSpec[] {
  const out: FlightSpec[] = []
  let offset = 0
  for (const e of events) {
    const flights = flightsFor(e, ctx, offset)
    if (flights.length > 0) {
      out.push(...flights)
      offset = endOf(out)
    }
  }
  return out.slice(0, MAX_FLIGHTS)
}

/** Total length of a plan in seconds (0 for none). */
export const planDuration = (flights: FlightSpec[]): number => endOf(flights)
