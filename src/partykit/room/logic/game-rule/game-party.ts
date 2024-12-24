import type { Ctx, Game } from './game-rule'

interface ImportConstructor<G extends Game, S = unknown> {
  game: G
  state: S
  activePlayers: Ctx['activePlayers']
  currentPlayer: string
  playOrder: string[]
}

interface Constructor<G extends Game> {
  game: G
  state: unknown
  numPlayers: number
}

class GameParty<G extends Game = Game> {
  state: unknown
  ctx: Ctx

  constructor(args: Constructor<G> | ImportConstructor<G>) {
    if ('activePlayers' in args) {
      this.state = args.state
      this.ctx = {
        numPlayers: Object.keys(args.activePlayers).length,
        activePlayers: args.activePlayers,
        currentPlayer: args.currentPlayer,
        playOrder: args.playOrder,
      }
    } else {
      const activePlayerIds = Array.from({ length: args.numPlayers }, (_, i) => i.toString())
      const activePlayers = activePlayerIds.reduce(
        (acc, id) => {
          acc[id] = 'play'
          return acc
        },
        {} as Ctx['activePlayers'],
      )

      this.state = args.game.setup({
        numPlayers: args.numPlayers,
        activePlayers: activePlayers,
        currentPlayer: activePlayerIds[0],
        playOrder: activePlayerIds,
      })
    }
  }
}
