/**
 * Pure seat derivation for `SeatLine` / `SeatRing` (spec §6.3, §7.5).
 *
 * - Players are ordered by `ctx.playOrder` and rotated so that self is `k = 0`.
 * - Only ids present in `gameState.players` are players. Presence ids that are not players
 *   are observers (`観戦`) and are appended after the players.
 * - Known server quirk: observers appear in `playOrder`, so the turn can land on one. In
 *   that case no seat is active.
 */
import type { PrimeDaifugoGameState } from '@/partykit/room/logic/game-rule/game-state'
import type { SeatModel } from './types'

/** The subset of `Ctx` the seats need. */
export type SeatCtx = {
  currentPlayer: string
  playOrder: string[]
}

export type SeatPresence = { id: string; name: string }

export type BuildSeatsArgs = {
  gameState: Pick<PrimeDaifugoGameState, 'players' | 'deckTopPlayer' | 'rule'> | null
  ctx: SeatCtx | null
  presence: SeatPresence[]
  selfId: string | null | undefined
  /** ids that passed during the current rotation (client-derived) */
  passedIds?: Iterable<string>
  /** seconds left on the current player's clock (`left-time`) */
  leftTime?: number | null
  /** penalty cards just received, by id (`+n` chip) */
  penalties?: Record<string, number>
}

/** Number of hue tokens (`--seat-0` … `--seat-3`). */
export const SEAT_HUE_COUNT = 4

/** `var(--seat-k)` for a playOrder index (wraps after 4). */
export function seatHueVar(hueIndex: number): string {
  const k = ((Math.floor(hueIndex) % SEAT_HUE_COUNT) + SEAT_HUE_COUNT) % SEAT_HUE_COUNT
  return `var(--seat-${k})`
}

/** Circled residue label: 0 → ①, 1 → ②, … (falls back to `(k+1)` past ⑳). */
export function residueLabel(k: number): string {
  const n = k + 1
  if (n >= 1 && n <= 20) {
    return String.fromCodePoint(0x2460 + n - 1)
  }
  return `(${n})`
}

/** Presence ids that are not players. Before the first game state, nobody is an observer. */
export function deriveObservers(
  gameState: Pick<PrimeDaifugoGameState, 'players'> | null,
  presence: SeatPresence[],
): string[] {
  if (!gameState) {
    return []
  }
  return presence.filter((p) => !(p.id in gameState.players)).map((p) => p.id)
}

/** The player who owns the field top (`deckTopPlayer`), when that id is a player. */
export function deriveLeadId(
  gameState: Pick<PrimeDaifugoGameState, 'players' | 'deckTopPlayer'> | null,
): string | null {
  const lead = gameState?.deckTopPlayer ?? null
  if (lead === null || !gameState || !(lead in gameState.players)) {
    return null
  }
  return lead
}

/** Play order restricted to players, rotated so that `selfId` comes first. */
export function orderPlayers(
  players: string[],
  playOrder: string[] | null | undefined,
  selfId: string | null | undefined,
): string[] {
  const set = new Set(players)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of playOrder ?? []) {
    if (set.has(id) && !seen.has(id)) {
      ordered.push(id)
      seen.add(id)
    }
  }
  for (const id of players) {
    if (!seen.has(id)) {
      ordered.push(id)
      seen.add(id)
    }
  }
  const selfIndex = selfId ? ordered.indexOf(selfId) : -1
  if (selfIndex <= 0) {
    return ordered
  }
  return [...ordered.slice(selfIndex), ...ordered.slice(0, selfIndex)]
}

/** The playOrder index (hue identity), or the fallback position when absent from playOrder. */
const hueIndexOf = (id: string, playOrder: string[], fallback: number) => {
  const i = playOrder.indexOf(id)
  return i >= 0 ? i : fallback
}

/**
 * Build the seat models for the table.
 * Returns the players first (self = k0, clockwise in play order), then the observers.
 */
export function buildSeats({
  gameState,
  ctx,
  presence,
  selfId,
  passedIds = [],
  leftTime = null,
  penalties = {},
}: BuildSeatsArgs): SeatModel[] {
  const nameOf = new Map(presence.map((p) => [p.id, p.name]))
  const passed = new Set(passedIds)
  const playOrder = ctx?.playOrder ?? []

  if (!gameState) {
    // Waiting room / before sync: everyone present is a prospective player without a hand.
    return presence.map((p, k) => ({
      id: p.id,
      name: p.name,
      handCount: null,
      hueIndex: hueIndexOf(p.id, playOrder, k),
      k,
      isSelf: p.id === selfId,
      isActive: false,
      isLead: false,
      passed: false,
      observer: false,
    }))
  }

  const playerIds = Object.keys(gameState.players)
  const ordered = orderPlayers(playerIds, playOrder, selfId)
  const leadId = deriveLeadId(gameState)
  const current = ctx?.currentPlayer ?? null
  const activeId = current !== null && current in gameState.players ? current : null
  const timeLimit = gameState.rule.timeLimit

  const seats: SeatModel[] = ordered.map((id, k) => {
    const isActive = id === activeId
    const seat: SeatModel = {
      id,
      name: nameOf.get(id) ?? id,
      handCount: gameState.players[id]?.hand.length ?? 0,
      hueIndex: hueIndexOf(id, playOrder, k),
      k,
      isSelf: id === selfId,
      isActive,
      isLead: id === leadId,
      passed: passed.has(id),
      observer: false,
      timeLimit,
    }
    if (isActive && leftTime !== null && leftTime !== undefined) {
      seat.leftTime = leftTime
    }
    const penalty = penalties[id]
    if (penalty !== undefined && penalty > 0) {
      seat.penalty = penalty
    }
    return seat
  })

  const observerIds = deriveObservers(gameState, presence)
  observerIds.forEach((id, i) => {
    seats.push({
      id,
      name: nameOf.get(id) ?? id,
      handCount: null,
      hueIndex: hueIndexOf(id, playOrder, ordered.length + i),
      k: ordered.length + i,
      isSelf: id === selfId,
      isActive: false,
      isLead: false,
      passed: false,
      observer: true,
    })
  })

  return seats
}

/** Players only (what the residue ring ℤ/nℤ is made of). */
export const playerSeats = (seats: SeatModel[]) => seats.filter((s) => !s.observer)

/** Observers only (the trailing `観戦` group). */
export const observerSeats = (seats: SeatModel[]) => seats.filter((s) => s.observer)
