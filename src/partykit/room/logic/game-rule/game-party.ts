import {
  type Ctx,
  type Game,
  INVALID_MOVE,
  type MoveEvents,
  type MoveFn,
  type MoveFnArgs,
} from './game-rule'

interface ImportConstructor<G extends Game = Game> {
  game: G
  state: ExtractStateFromGame<G>
  activePlayers: Ctx['activePlayers']
  currentPlayer: string
  playOrder: string[]
}

interface Constructor<G extends Game = Game> {
  game: G
  playerIds: string[]
}

// Tail ユーティリティ型: タプル型の最初の要素を除外
type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never
type ExtractStateFromGame<G extends Game<unknown>> = G extends Game<infer S> ? S : never

export class GameParty<G extends Game = Game> {
  private readonly game: G
  private state: ExtractStateFromGame<G>
  readonly ctx: Ctx
  moves: {
    [K in keyof G['moves']]: (
      playerId: string,
      ...args: Tail<Parameters<MoveFn<ExtractStateFromGame<G>>>>
    ) => void
  }

  constructor(args: Constructor<G> | ImportConstructor<G>) {
    this.game = args.game
    if ('state' in args) {
      this.state = args.state as ExtractStateFromGame<G>
      this.ctx = {
        numPlayers: Object.keys(args.activePlayers).length,
        activePlayers: args.activePlayers,
        currentPlayer: args.currentPlayer,
        playOrder: args.playOrder,
      }
    } else {
      const activePlayers: Ctx['activePlayers'] = {}
      for (const playerId of args.playerIds) {
        activePlayers[playerId] = 'play'
      }
      this.ctx = {
        numPlayers: args.playerIds.length,
        activePlayers: activePlayers,
        currentPlayer: args.playerIds[0],
        playOrder: args.playerIds,
      }
      this.state = this.setup()
    }
    this.moves = this.initializeMoves()
  }

  private initializeMoves(): {
    [K in keyof G['moves']]: (
      playerId: string,
      ...args: Tail<Parameters<MoveFn<ExtractStateFromGame<G>>>>
    ) => void
  } {
    const move = {} as any
    for (const moveName in this.game.moves) {
      ;(move as any)[moveName] = (playerId: string, ...args: unknown[]) => {
        if (playerId !== this.ctx.currentPlayer) {
          return
        }

        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        const moveFn = this.game.moves![moveName]

        const events: MoveEvents = {
          endTurn: (args) => {
            if (args?.next) {
              if (!this.ctx.activePlayers[args.next]) {
                throw new Error(`Invalid player: ${args.next}`)
              }
              this.ctx.currentPlayer = args.next
            } else {
              const currentPlayerIndex = this.ctx.playOrder.indexOf(this.ctx.currentPlayer)
              const nextPlayerIndex = (currentPlayerIndex + 1) % this.ctx.numPlayers
              this.ctx.currentPlayer = this.ctx.playOrder[nextPlayerIndex]
            }
          },
        }

        const moveArgs: MoveFnArgs<ExtractStateFromGame<G>> = {
          ctx: this.ctx,
          state: this.state,
          events,
        }
        const result = moveFn(moveArgs, ...args)
        if (result !== INVALID_MOVE) {
          this.state = result as ExtractStateFromGame<G>
        }
        return result
      }
    }
    return move
  }

  private setup(): ExtractStateFromGame<G> {
    this.ctx.currentPlayer = this.ctx.playOrder[0]

    return this.game.setup(this.ctx) as ExtractStateFromGame<G>
  }

  getState(): ExtractStateFromGame<G> {
    return this.state
  }
}
