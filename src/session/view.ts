/**
 * Per-viewer redacted view (spec §6.3, RQ-S16): the viewer's own hand only, `handCount` for
 * everyone, `deckCount` instead of the deck. Never contains another player's cards or the deck order.
 */
import type { View, ViewGame } from '../shared/protocol'
import { byJoinedAt } from './members'
import type { ViewFor } from './types'

export const viewFor: ViewFor = (state, pid) => {
  const members = byJoinedAt(state.members).map((id) => {
    const m = state.members[id]
    const row = { id, name: m.name, ready: m.ready, role: m.role, connected: m.connected }
    return m.bot === undefined ? row : { ...row, bot: m.bot }
  })
  let game: ViewGame | null = null
  if (state.game !== null) {
    const { core } = state.game
    const players: ViewGame['players'] = {}
    for (const [id, p] of Object.entries(core.players)) {
      players[id] = { handCount: p.hand.length, drawRight: p.drawRight }
    }
    const winner = core.winner
    game = {
      round: state.game.round,
      turn: core.turn,
      playOrder: [...core.playOrder],
      currentPlayer: core.currentPlayer,
      players,
      hand: core.players[pid] ? [...core.players[pid].hand] : [],
      field: core.field.map((set) => [...set]),
      deckCount: core.deck.length,
      deckTopPlayer: core.deckTopPlayer,
      deadline: state.game.deadline,
      winner: winner === null ? null : { id: winner, name: state.members[winner]?.name ?? '' },
      lastResult: core.lastResult,
    }
  }
  const view: View = {
    roomId: state.roomId,
    status: state.status,
    rule: { ...state.rule },
    version: state.version,
    members,
    game,
  }
  return view
}
