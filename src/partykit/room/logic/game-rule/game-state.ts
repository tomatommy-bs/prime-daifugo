import { CardId } from "@/game-card/src"


export interface GameState {
  players: {
    [playerID: string]: {
      hand: CardId[]
    }
  }
  /**
   * 現在場に出ているカード
   */
  field: CardId[]
  /**
   * 山札
   */
  deck: CardId[]
}
