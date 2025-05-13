import type { Game } from 'boardgame.io'
import { Client } from 'boardgame.io/client'
const G: Game = {
  setup: ({ ctx }) => {},
  moves: {
    a: ({ ctx, events, G, log, playerID, random }) => {
      events.endTurn
    },
  },
  endIf: (ctx) => {},
}

const client = Client({
  game: G,
})

client.moves.a()
