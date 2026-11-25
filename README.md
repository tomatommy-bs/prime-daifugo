# Getting Started

- hosting サーバーと、websocket サーバーを立ち上げる

```bash
npm run dev
npm run dev:pk
```

# 素数大富豪のルール

https://primeqk.themedia.jp/pages/4500251/rules

## ルールのポイント（概略）

- 手札のカードを組み合わせて「素数」を作って出していき、早く手札をなくした人の勝ち
- カードの数字を並べて読み、ひとつの数として取り扱う
- 前の人が出した数と同じ枚数で、より大きな数を作って出さなければならない

## 基本ルール

- **勝利条件：** 参加プレイヤーの中で最も早く手札をなくす（出しきる）こと。
- **カードの扱い：** \[A]=1, \[J]=11, \[Q]=12, \[K]=13 として扱う。
- **数の作り方：** 2枚以上のカードを組み合わせて数を作る際は、カードに書かれた数を並べてひとつの数として扱う。 例：\\[Q]\[A] → 6,121（4桁の数）
- **手札を増やす：** 自分の手番では、山札の上から1枚までカードを引いて手札に加えることができる。

## 特殊ルール

- **ジョーカー：** 1枚出しでは13（K）に勝つものとして出すことができ、さらに出すと場を流すことができる。 他のカードと組み合わせて2枚以上で出す際は、0～13のいずれかの数として使う。（出す際にどの数として出すのかを宣言する。）
- **57【グロタンディーク素数切り】：** 57は「グロタンディーク素数」と呼ばれる特別な数で、出すと場を流すことができる。
- **1729【ラマヌジャン革命】：** 1729は特別な数で、出すと「ラマヌジャン革命」が起きる。 革命下では、数の大小判定が逆転する。 効果は、再度ラマヌジャン革命が起こる（場に1729が出される）まで続く。
- **合成数出し:** 合成数は、その数とともに素因数分解の式を作って一緒に出すことで、場に出すことができる。 素因数に使った札は即座に流れ、場には出された合成数のみが残る。

## 素数大富豪の遊び方［トランプで遊ぶ場合］

**［用意するもの：トランプ1組（54枚）、対戦相手（1～5人程度）、素数判定員（または素数判定アプリ等）］**

1.  トランプをよくきり、各プレイヤーに手札を11枚（原則は素数枚。5枚/7枚でもよい）ずつ配る。 残ったカードは、山札として場の中央に裏向きに積んでおく。
2.  ジャンケン等で順番を決める。
3.  プレイヤーは、自分の手番中に以下のことができる。
    - ① 手札を増やしたい場合は、山札からカードを1枚引いて手札に加えることができる（任意）。
    - ② 場に出ている数と同じ枚数の手札を組み合わせて、場に出ている数より大きな素数を作って場に出す。
      - ※ 場に数が出ていない時は、好きな枚数で出してよい
      - ※ 出す数ははっきりと宣言すること（並び順により異なる数となるため）
    - ③ 出せるものがない場合や出したくない場合は、「パス」を宣言する。
4.  場に数が出されたら、その数が素数であるかどうかを素数判定員が確認する。
    - ※ 素数判定員はプレイヤーが兼任してもよい
5.  出した数が素数でなかった場合は、ペナルティとして出した札を手札に戻し、さらに同じ枚数だけ山札からカードを引く。
6.  場に出された数が更新されないまま手番が一周したら、場のカードを流して、最後の数を出したプレイヤーの手番になる。
7.  これを繰り返して、より早く手札を出しきったプレイヤーの勝ちとなる。

# アーキテクチャ

## 概要

このプロジェクトは Next.js ベースのフロントエンドと PartyKit による WebSocket サーバーを組み合わせたリアルタイムマルチプレイヤーゲームアプリケーションです。

## 技術スタック

### フロントエンド

- **Next.js 14**: App Router を使用したモダンな React フレームワーク
- **Mantine 8**: UI コンポーネントライブラリ（テーマは `src/design/theme.ts`、色はデザイントークンに連動）
- **Tailwind CSS v4**: スタイリング（トークン・Fibonacci 余白・レイアウト用カスタムバリアントを `src/app/globals.css` で定義）
- **TypeScript**: 型安全性の確保
- **Framer Motion**: アニメーション（`LazyMotion` + `m.*`、モーショントークンは `src/design/motion.ts`）
- **Geist / Geist Mono**: 本文・数式用フォント（`src/design/fonts.ts`）
- **Zod**: スキーマバリデーション

### バックエンド

- **PartyKit**: リアルタイム WebSocket サーバー
- **primes-and-factors**: 素数計算ライブラリ

### 開発・テスト環境

- **Biome**: リンティング・フォーマッティング
- **Vitest + React Testing Library（jsdom）**: ユニットテスト（`unit` プロジェクト）
- **Storybook 8 + Vitest ブラウザモード（Playwright / Chromium）**: ストーリーの描画・操作テスト（`storybook` プロジェクト）
- **Playwright**: デザインギャラリーのスクリーンショット取得（`scripts/screens.mjs`, `scripts/flights.mjs`）

## デザインシステム（`src/design`）

UI は「ふるい（Sieve Table）」という数学モチーフのデザインで統一しています。仕様の詳細は [`docs/design/redesign-spec.md`](docs/design/redesign-spec.md) を参照してください。

### トークン

- **色**: `src/app/globals.css` の CSS 変数が唯一の定義元です（`--bg`, `--surface`, `--ink`, `--prime`, `--composite`, `--mod`, `--factor`, `--gold`, `--danger` など）。ライト / ダークの両方を定義し、Tailwind（`bg-surface`, `text-ink` など）と Mantine（`src/design/theme.ts`）はこの変数を参照します。`src/design/tokens.ts` は TypeScript 用のミラーで、`tokens.test.ts` が globals.css との一致と WCAG コントラストを検証します。
- **余白**: Fibonacci 数列（4 / 8 / 12 / 20 / 32 / 52 / 84px）。Tailwind では `p-fib-3` や `gap-fib-2` のように使います。
- **文字**: 比率 1.25（長三度）・基準 16px のモジュラースケール（`--fs--2` 〜 `--fs-6`）。数字は Geist Mono の `num` クラス、または `NumberGlyph` で表示します。
- **モーション**: 時間は Fibonacci ミリ秒（`DUR.xs` = 89ms 〜）。`useMotionMode()` が OS の「視差効果を減らす」設定に従い、reduced では移動を 144ms 以下のフェードに置き換えます。
- **レイアウトモード**: `compact`（横向きスマホ、高さ 500px 以下）/ `portrait`（縦向きスマホ）/ `regular` / `wide`（1280×720 以上）。Tailwind のカスタムバリアント（`compact:`, `portrait-phone:`, `wide:`）と `useLayoutMode()` が同じメディアクエリを使います。

### コンポーネントの構成

- **数学プリミティブ**（`src/design/`）: `SieveGrid`（エラトステネスの篩）, `UlamField`（ウラムの螺旋）, `NumberGlyph`, `Expr`（素因数分解の式）, `FactorTree`, `ModRing`（ℤ/nℤ の目盛り）。ホーム・ローディング・カード裏面・結果表示で共通して使います。
- **対局画面**（`src/app/room/[id]/_ui/board/`）: `game-board.tsx` は薄いコンテナで、サーバー状態を `board-state.ts` / `seat-model.ts` で表示用モデルに変換し、`use-board-director.ts` が状態遷移（`classify-transition.ts`）から演出イベント（カードの飛行・結果プレート・57 切り・GAME SET）を一度ずつ発火します。`BoardLayout` がレイアウトモードごとに席（`SeatLine` / `SeatRing`）・場（`FieldStack`）・山札・提出トレイ・素因数分解パネル・手札・操作ボタンを配置します。
- **通信・ルールは変更していません**: `src/partykit`, `src/interface`, `src/utils/play-card.ts`, `hooks.ts`, `client-messenger.ts` は従来どおりで、デザインは表示層だけで完結しています。

### デザインギャラリー

`/labo/gallery?scene=<scene>&scheme=light|dark` で、サーバーに接続せず固定データで各シーンを表示できます。シーンは `home-parts`, `waiting`, `my-turn`, `opp-turn`, `factor`, `not-prime`, `cut57`, `flow`, `game-set`, `observer`, `connecting`, `flights` です。

## ディレクトリ構造と役割

```
src/
├── app/                    # Next.js App Router ページ
│   ├── globals.css        # デザイントークン（CSS 変数）の唯一の定義元
│   ├── room/[id]/         # ゲームルーム関連ページ
│   │   └── _ui/board/     # 対局画面（席・場・手札・提出トレイ・素因数分解パネル・演出）
│   ├── labo/calc/         # 素数判定ラボ
│   ├── labo/gallery/      # デザインギャラリー（固定データで全シーンを描画）
│   └── login/             # ログイン機能
├── components/            # 再利用可能なReactコンポーネント
├── constants/             # アプリケーション定数
├── design/                # デザインシステム「ふるい（Sieve Table）」
│   ├── tokens.ts          # 色トークン（globals.css のミラー、テストで同期とコントラストを検証）
│   ├── theme.ts           # Mantine テーマ / theme-provider.tsx
│   ├── motion.ts          # 時間（Fibonacci ms）・イージング・スプリング・プリセット
│   ├── use-layout-mode.ts # compact / portrait / regular / wide の判定
│   ├── icons.tsx          # 数学記号ベースの自作アイコン
│   ├── SieveGrid.tsx など  # 数学プリミティブ（NumberGlyph, Expr, FactorTree, ModRing, UlamField）
│   └── math/              # 篩・素因数分解・ウラムの螺旋・席や軌道の幾何計算
├── game-card/             # カードゲーム専用コンポーネント
│   └── src/
│       ├── components/    # カードコンポーネント（MathCard ラッパー）
│       └── icons/         # 全54枚のカードアイコン（裏面はウラムの螺旋）
├── hooks/                 # カスタムReactフック
├── interface/             # 型定義・通信インターフェース
│   ├── client-to-server.ts
│   ├── server-to-client.ts
│   └── common.ts
├── partykit/              # WebSocketサーバーロジック
│   ├── lobby/             # ロビー管理
│   ├── room/              # ゲームルーム管理
│   │   └── logic/         # ゲームルール・状態管理
│   └── main.ts            # PartyKitエントリーポイント
└── utils/                 # ユーティリティ関数
```

## 開発上の利点

### 1. モジュラー設計

- **分離された関心事**: フロントエンド（Next.js）とリアルタイム通信（PartyKit）の明確な分離
- **再利用可能なコンポーネント**: `game-card/` パッケージによる独立したカードシステム
- **型安全な通信**: `interface/` による厳密な型定義

### 2. スケーラブルな開発環境

- **TypeScript**: 型安全性による早期バグ発見
- **Biome**: 高速なリンティング・フォーマッティング
- **Storybook**: 分離された環境でのコンポーネント開発
- **テスト環境**: Vitest（ユニット + Storybook ブラウザテスト）と Playwright のスクリーンショットによる包括的な検証

### 3. リアルタイム機能

- **PartyKit**: 簡単な WebSocket サーバー構築
- **状態同期**: サーバー・クライアント間の自動的な状態同期
- **ルーム管理**: 動的なゲームルーム作成・管理

### 4. ゲーム特化機能

- **素数計算**: `primes-and-factors` による高速な素数判定
- **カードシステム**: 全54枚のカードを網羅した型安全なシステム
- **ゲームルール**: モジュール化されたゲームロジック（`src/partykit/room/logic/`）

### 5. 開発効率化

```bash
# 開発サーバー起動（並行実行）
npm run dev      # Next.js開発サーバー
npm run dev:pk   # PartyKit開発サーバー

# コード品質管理
npm run biome          # リンティング・フォーマット（自動修正あり）
npx biome ci src       # CI と同じチェック（修正なし）
npx tsc --noEmit       # 型チェック

# テスト
npm test               # ユニットテスト（Vitest `unit` プロジェクト、jsdom）
npm run test:watch     # ユニットテストの watch モード
npm run test:coverage  # カバレッジ付きユニットテスト（coverage/ に出力）
npm run test:storybook # 全ストーリーをブラウザ（Chromium）で描画して検証

# ストーリーブック
npm run storybook       # コンポーネント開発環境（:6006）
npm run build-storybook # 静的ビルド
```

#### スクリーンショット

```bash
npm run screens   # デザインギャラリー全シーン + / , /login , /labo/calc を撮影
npm run flights   # カード飛行アニメーションのフレーム連番とコンタクトシート
```

- `npm run screens` は各シーンを 3 つのビューポート（844×390, 390×844, 1440×900）× ライト / ダークで撮影し、`docs/design/screens/<scene>-<w>x<h>-<scheme>.png`（git 管理外）に保存します（現在 84 枚）。再現性のため reduced motion で撮影し、ページエラーやコンソールエラーがあれば終了コード 1 で失敗します。
- `BASE_URL` に何も応答しなければ `next dev -p 3123` を自動で起動・終了します。既存のサーバーを使う場合は `BASE_URL=http://localhost:3000`、一部だけ撮る場合は `SCENES=factor,cut57` を指定します。
- Playwright 同梱の Chromium が無い環境では `PW_CHROMIUM_PATH` に既存の `chrome-headless-shell` のパスを指定します（例: `~/Library/Caches/ms-playwright/chromium_headless_shell-<rev>/chrome-headless-shell-mac-arm64/chrome-headless-shell`）。`npm run test:storybook` も同じブラウザを使います。
- `npm run flights` は `STEPS`, `VIEWPORTS`, `FRAME_MS` で対象と間隔を絞れます。出力先は `docs/design/screens/flights/` です。
- `next dev` / `next build` は `package-lock.json` を書き換えることがあります。その差分はコミットせずに戻してください。

### 6. デプロイメント

- **Vercel**: フロントエンドの自動デプロイ
- **PartyKit Cloud**: WebSocketサーバーの管理デプロイ
- **一括デプロイ**: `npm run deploy` による統合デプロイ
