/**
 * Pure mapping from the wire view and events (spec §6.2-6.3) to the UI shapes (spec §9.2-9.3).
 */
import type { ClientGameStateBundle, ClientPlayer, SystemMessage } from '@/shared/client-state'
import type { RoomEvent, View, ViewMember } from '@/shared/protocol'
import type { SessionPresence, TransitionMsg } from './types'

/** Shown when an event names a pid that is no longer a member (never the raw pid, RQ-S2). */
export const UNKNOWN_NAME = '???'

/**
 * The viewer's game in the UI shape, or null when the view has no game. Only `selfId` gets
 * `hand`; every other player has `hand: []` and a `handCount`.
 */
export function viewToBundle(view: View, selfId: string | null): ClientGameStateBundle | null {
  const game = view.game
  if (game === null) {
    return null
  }
  const players: Record<string, ClientPlayer> = {}
  for (const [pid, p] of Object.entries(game.players)) {
    players[pid] = {
      hand: pid === selfId ? [...game.hand] : [],
      handCount: p.handCount,
      drawRight: p.drawRight,
    }
  }
  return {
    gameState: {
      players,
      field: game.field.map((set) => [...set]),
      deckCount: game.deckCount,
      deckTopPlayer: game.deckTopPlayer,
      rule: { ...view.rule },
      winner: game.winner?.id ?? null,
      lastSubmitError: game.lastResult,
    },
    ctx: {
      currentPlayer: game.currentPlayer,
      playOrder: [...game.playOrder],
      turn: game.turn,
      deadline: game.deadline,
    },
  }
}

/** Presence rows in member order (`ready` → `'ready'`, otherwise `'not-ready'`). */
export function viewToPresence(view: View): SessionPresence[] {
  return view.members.map((m) => {
    const row: SessionPresence = {
      id: m.id,
      name: m.name,
      status: m.ready ? 'ready' : 'not-ready',
      role: m.role,
      connected: m.connected,
    }
    return m.bot === undefined ? row : { ...row, bot: m.bot }
  })
}

const nameOf = (members: readonly ViewMember[], pid: string): string =>
  members.find((m) => m.id === pid)?.name ?? UNKNOWN_NAME

const commander = (members: readonly ViewMember[], pid: string) => ({
  id: pid,
  name: nameOf(members, pid),
})

/**
 * The director message for a game event (spec §9.2), or null for events that only update
 * presence or the rule (`presence`, `ready-changed`, `rule-changed`, `forfeited`, `member-left`).
 */
export function eventToSystemMessage(
  e: RoomEvent,
  members: readonly ViewMember[],
): SystemMessage | null {
  switch (e.type) {
    case 'game-started':
      return { action: 'game-start', commander: commander(members, e.by) }
    case 'drew':
      return { action: 'draw', commander: commander(members, e.by) }
    case 'passed':
      return { action: 'pass', commander: commander(members, e.by), reason: e.reason }
    case 'submitted':
      return {
        action: 'submit',
        commander: commander(members, e.by),
        submissionResult: {
          submitCardSet: { submit: [...e.submit], factor: [...e.factor] },
          result: e.result,
        },
      }
    case 'game-ended':
      return { action: 'game-end', winner: e.winnerName, winnerId: e.winnerId }
    default:
      return null
  }
}

/**
 * The transition message for an in-order event, or null when the event makes no transition:
 * game events → their `SystemMessage`; `rule-changed` → `change-rule`; `forfeited` → `snapshot`
 * (seats and field re-render without flights); `presence`, `ready-changed`, `member-left` → null.
 */
export function eventToTransitionMsg(
  e: RoomEvent,
  members: readonly ViewMember[],
): TransitionMsg | null {
  if (e.type === 'rule-changed') {
    return { action: 'change-rule', rule: { ...e.rule }, by: e.by }
  }
  if (e.type === 'forfeited') {
    return { action: 'snapshot' }
  }
  return eventToSystemMessage(e, members)
}
