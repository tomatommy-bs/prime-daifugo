import { CardId } from "@repo/game-card";

export interface GameState {
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
