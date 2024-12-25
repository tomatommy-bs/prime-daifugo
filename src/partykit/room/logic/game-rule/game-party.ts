import { type Ctx, type Game, INVALID_MOVE, type MoveEvents, type MoveFnArgs } from './game-rule'

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

export class GameParty<G extends Game = Game> {
  game: G
  private state: ExtractStateFromGame<G>
  readonly ctx: Ctx
  move: {
    [K in keyof G['moves']]: (playerId: string, ...args: Tail<Parameters<G['moves'][K]>>) => void
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

      this.ctx = {
        numPlayers: args.numPlayers,
        activePlayers: activePlayers,
        currentPlayer: activePlayerIds[0],
        playOrder: activePlayerIds,
      }
    }

    this.move = {} as this['move']
    for (const moveName in this.game.moves) {
      ;(this.move as any)[moveName] = (playerId: string, ...args: unknown[]) => {
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
  }

  getState(): Readonly<ExtractStateFromGame<G>> {
    return this.state
  }
}
