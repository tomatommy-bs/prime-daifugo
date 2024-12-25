import { type Ctx, type Game, INVALID_MOVE, type MoveFnArgs, PrimeDaifugoGame } from './game-rule'

interface ImportConstructor<G extends Game, S = unknown> {
  game: G
  state: S
  activePlayers: Ctx['activePlayers']
  currentPlayer: string
  playOrder: string[]
}

interface Constructor<G extends Game> {
  game: G
  numPlayers: number
}

// Tail ユーティリティ型: タプル型の最初の要素を除外
type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never
type ExtractStateFromGame<G extends Game> = G extends Game<infer S> ? S : never

class GameParty<G extends Game = Game> {
  game: G
  state: ExtractStateFromGame<G>
  ctx: Ctx
  move: {
    [K in keyof G['moves']]: (...args: Tail<Parameters<G['moves'][K]>>) => ReturnType<G['moves'][K]>
  }

  constructor(args: Constructor<G> | ImportConstructor<G>) {
    this.game = args.game
    if ('activePlayers' in args) {
      this.state = args.state as ExtractStateFromGame<G>
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
      }) as ExtractStateFromGame<G>
    }

    this.move = {} as this['move']
    for (const moveName in this.game.moves) {
      ;(this.move as any)[moveName] = (...args: unknown[]) => {
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        const moveFn = this.game.moves![moveName]
        const moveArgs: MoveFnArgs<ExtractStateFromGame<G>> = { ctx: this.ctx, state: this.state }
        const result = moveFn(moveArgs, ...args)
        if (result !== INVALID_MOVE) {
          this.state = result as ExtractStateFromGame<G>
        }
        return result
      }
    }
  }

  getState() {
    return this.state
  }
}

const party = new GameParty({
  game: PrimeDaifugoGame,
  numPlayers: 2,
})

party.move.draw(1)
