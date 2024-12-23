import { Game } from "boardgame.io";
import { CardId, cardIds } from "@repo/game-card";

const config = {
  initialNumCards: 8,
} as const;

export interface G {
  players: {
    [playerID: string]: {
      hand: CardId[];
    };
  };
  /**
   * 現在場に出ているカード
   */
  field: CardId[];
  /**
   * 山札
   */
  deck: CardId[];
}

const arrayPops = <T>(array: T[], num: number): T[] => {
  const result: T[] = [];
  for (let i = 0; i < num; i++) {
    result.push(array.pop()!);
  }
  return result;
};

export const PrimeDaifugoGame: Game<G, { draw: () => void }> = {
  name: "prime-daifugo",
  minPlayers: 2,
  maxPlayers: 4,

  setup: ({ random, ctx }) => {
    const playerIds = Object.keys(ctx.activePlayers ?? {});
    const initialDeck = random.Shuffle([...cardIds]);

    const players: G["players"] = {};
    for (const playerID of playerIds) {
      players[playerID] = {
        hand: arrayPops(initialDeck, config.initialNumCards),
      };
    }
    const G: G = {
      players: players,
      deck: initialDeck,
      field: [],
    };
    return G;
  },

  /**
   * いづれかのプレイヤーの手札が0になったら終了
   */
  endIf: ({ G }) => {
    return Object.values(G.players).some((player) => player.hand.length === 0);
  },

  moves: {
    /**
     * 場にカードを出す
     */
    submit: ({ G, ctx, events }) => {},

    /**
     * パスする
     */
    pass: ({ G, ctx, events }) => {},

    /**
     * カードを引く
     */
    draw: ({ G, ctx, events }) => {
      const player = G.players[ctx.currentPlayer];
      player?.hand.push(G.deck.pop()!);
      console.log("player", player);
      events.endTurn();
    },
  },
};
