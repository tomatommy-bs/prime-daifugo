import { cardIds } from "@repo/game-card";
import { GameState } from "./game-state";
import _ from "lodash";

export type StageName = "observe" | "wait" | "play" | "end";

export interface Ctx<stage = string> {
  numPlayers: number;
  activePlayers: {
    [playerID: string]: stage;
  };
}

interface Game<S = GameState> {
  name?: string;
  minPlayers?: number;
  maxPlayers?: number;
  moves?: MoveMap<S>;
  events?: {
    endGame?: boolean;
    endPhase?: boolean;
    endTurn?: boolean;
    setPhase?: boolean;
    endStage?: boolean;
    setStage?: boolean;
    pass?: boolean;
    setActivePlayers?: boolean;
  };
  setup: (ctx: Ctx) => S;
}

interface MoveMap<S = unknown> {
  [moveName: string]: (ctx: Ctx) => GameState;
}

const config = {
  initialNumCards: 8,
} as const;

export const PrimeDaifugoGame: Game<GameState> = {
  name: "prime-daifugo",
  minPlayers: 2,
  maxPlayers: 4,
  setup: function (ctx) {
    const deck = _.shuffle([...cardIds]);

    if (
      ctx.numPlayers > (this.maxPlayers ?? Infinity) ||
      ctx.numPlayers < (this.minPlayers ?? 0)
    ) {
      throw new Error("Invalid number of players");
    }
    if (deck.length < config.initialNumCards * ctx.numPlayers)
      throw new Error("Not enough cards for all players");

    const players: GameState["players"] = {};
    for (const playerID of Object.keys(ctx.activePlayers)) {
      players[playerID] = {
        hand: deck.splice(0, config.initialNumCards),
      };
    }

    return {
      players,
      field: [],
      deck: deck,
    };
  },
};
