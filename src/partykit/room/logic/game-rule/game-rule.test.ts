import { PrimeDaifugoGame } from "./game-rule";

describe("PrimeDaifugoGame", () => {
  describe("setup", () => {
    it("各プレイヤーに正しい数のカードが配られること", () => {
      const ctx = {
        numPlayers: 2,
        activePlayers: {
          "0": "play",
          "1": "play",
        },
      };

      const initialState = PrimeDaifugoGame.setup(ctx);

      // 各プレイヤーが8枚のカードを持っていることを確認
      expect(initialState.players["0"]?.hand).toHaveLength(8);
      expect(initialState.players["1"]?.hand).toHaveLength(8);

      // フィールドが空であることを確認
      expect(initialState.field).toHaveLength(0);

      // デッキが残っていることを確認
      expect(initialState.deck).toBeDefined();
    });

    it("プレイヤー数が多すぎる場合はエラーを投げること", () => {
      const ctx = {
        numPlayers: 5,
        activePlayers: {
          "0": "play",
          "1": "play",
          "2": "play",
          "3": "play",
          "4": "play",
        },
      };

      expect(() => PrimeDaifugoGame.setup(ctx)).toThrow();
    });
  });
});
