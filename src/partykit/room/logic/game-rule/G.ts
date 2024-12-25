import type { Game } from 'boardgame.io'
const G: Game = {
  setup: ({ ctx }) => {},
  moves: {
    a: ({ ctx, events, G, log, playerID, random }) => {
      events.endTurn
    },
  },
}
