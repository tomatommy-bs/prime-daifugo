import type { CardId } from '@/game-card/src'

export interface PrimeDaifugoGameState {
  players: {
    [playerID: string]: {
      hand: CardId[]
      /** 山札からひく権利 */
      drawRight: boolean
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
