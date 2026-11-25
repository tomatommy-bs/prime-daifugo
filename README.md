# Getting Started

フロントエンド（Next.js）とリアルタイムバックエンド（Cloudflare Worker をローカルの `wrangler dev` で実行）を、コマンド 1 つでまとめて起動します。Cloudflare アカウントもネットワーク接続も不要です。

```bash
npm install
npm run dev          # next dev（:3000）+ wrangler dev（:8787）を並行起動
```

- 個別に起動する場合は `npm run dev:web`（Next.js のみ）と `npm run dev:server`（Worker のみ、`:8787`）を別々のターミナルで実行します。
- `next dev` だけでも `/labo/gallery` や静的ページは表示できます。その場合ホームのロビー接続は失敗し、カウンターは「—」のままです。
- ブラウザを 2 つ（または通常ウィンドウとシークレットウィンドウ）開き、それぞれ別の名前でログインすると 1 台で対戦を試せます。
- Worker の部屋の状態は `.wrangler/state`（git 管理外）に保存されます。消すと空の状態から始まります。

## 環境変数

| 変数 | 使う場所 | 既定値・説明 |
|---|---|---|
| `NEXT_PUBLIC_REALTIME_URL` | Next.js | バックエンドの URL。コミット済みの `.env.development` に `http://127.0.0.1:8787` が入っています。本番ビルド（`VERCEL_ENV=production`）では未設定や localhost を指す値だとビルドが失敗します |
| `ALLOWED_ORIGINS` | Worker | WebSocket 接続を許可する Origin（カンマ区切り）。開発用の値は `worker/wrangler.jsonc` の `vars` にあります |
| `GRACE_PLAYING_MS` / `GRACE_IDLE_MS` | Worker | 切断後に席を保持する猶予（対局中 120 秒 / 待機中 60 秒） |
| `AWAY_TURN_CAP_MS` | Worker | 切断中のプレイヤーの手番の上限（20 秒） |
| `ROOM_TTL_IDLE_MS` / `ROOM_TTL_ACTIVE_MS` | Worker | 誰も接続していない部屋を削除するまでの時間（10 分 / 30 分） |
| `ROOMS_SECRET` | Worker（secret）と Next.js（サーバー側のみ） | 設定すると `POST /rooms`（部屋の作成）にこの値が必要になります。両方に同じ値を設定します。開発では未設定で構いません。`NEXT_PUBLIC_` は付けません |

Worker の値は `worker/.dev.vars`（git 管理外）や `npm run dev:server -- --var GRACE_PLAYING_MS:5000` で上書きできます。秘密情報はコミットしないでください（`.env.development` には秘密でないローカル既定値だけを置きます）。

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

このプロジェクトは Next.js ベースのフロントエンド（Vercel）と、Cloudflare Workers + Durable Objects によるリアルタイムバックエンドを組み合わせたマルチプレイヤーゲームアプリケーションです。設計の詳細は [`docs/realtime/rebuild-spec.md`](docs/realtime/rebuild-spec.md) を参照してください。

```
ブラウザ（Next.js / Vercel）
  /            ── WS   {RT}/lobby        ─▶ Worker ─▶ LobbyDO（ホームのカウンター）
  /room/new    ── POST {RT}/rooms        ─▶ Worker ─▶ LobbyDO（素数の部屋 ID を払い出し）
  /room/[id]   ── WS   {RT}/rooms/:id/ws ─▶ Worker ─▶ RoomDO（部屋ごとのセッションと対局）
```

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

- **Cloudflare Workers + Durable Objects**（`worker/`）: Worker `prime-daifugo-rt` に SQLite ストレージ付きの Durable Object を 2 つ持ちます。`RoomDO` は部屋ごとのセッション・対局・タイマー、`LobbyDO` はロビーの集計と部屋 ID の払い出しを担当します。WebSocket Hibernation API を直接使うので、接続が待機中の部屋には費用がかかりません。
- **純粋な TypeScript の共有層**（Worker と Next.js の両方から import）:
  - `src/shared`: プロトコル（zod スキーマ）・ルール設定・ID・乱数・名前の検証
  - `src/game`: ルールエンジン（BigInt で決定的に動作）
  - `src/session`: 部屋のリデューサ・プレイヤーごとの表示用ビュー・シミュレータ
- **セッション管理**: プレイヤーはブラウザが持つ `pd_sid` から導いた安定した ID で識別されます。リロード・回線の瞬断・スマホのタブの休止があっても、猶予期間内なら同じ席と手札に戻れます。手番の締め切りはサーバーが持ち、切断中のプレイヤーは自動でパスされます。
- **ルーティングの代替案**: Worker のルーティングは手書きです（固定ルートは 2 本だけ）。保守が負担になった場合は、Cloudflare の `partyserver`（npm パッケージ）に置き換えられるよう、仕様書 §2.3 に代替案として記録しています。

### 開発・テスト環境

- **Biome**: リンティング・フォーマッティング
- **Vitest + React Testing Library（jsdom）**: ユニットテスト（`unit` プロジェクト）
- **Storybook 8 + Vitest ブラウザモード（Playwright / Chromium）**: ストーリーの描画・操作テスト（`storybook` プロジェクト）
- **Playwright**: 複数ブラウザでの E2E（`e2e/`）と、デザインギャラリーのスクリーンショット取得（`scripts/screens.mjs`, `scripts/flights.mjs`）
- **wrangler / workerd**: Worker のローカル実行と結合テスト（`worker/test/integration/`）

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
- **通信層**: UI がバックエンドとやり取りする窓口は `useRoomSession(roomId)`（`src/app/room/[id]/session/`）だけです。再接続付きの WebSocket トランスポート・クライアント側リデューサ・サーバー時刻に合わせた手番タイマーをまとめ、ボードの各コンポーネントには表示用の状態と操作だけを渡します。

### デザインギャラリー

`/labo/gallery?scene=<scene>&scheme=light|dark` で、サーバーに接続せず固定データで各シーンを表示できます。シーンは `home-parts`, `waiting`, `my-turn`, `opp-turn`, `factor`, `not-prime`, `cut57`, `flow`, `game-set`, `observer`, `connecting`, `reconnecting-seat`（相手が再接続中の席）, `superseded`（別のタブで開かれた状態）, `flights` です。

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
├── shared/                # プロトコル・ルール設定・ID・乱数（Worker と共有、純粋 TS）
├── game/                  # ルールエンジン（純粋 TS）
├── session/               # 部屋のリデューサ・ビュー・シミュレータ（純粋 TS）
├── lib/                   # セッション ID、バックエンドへの HTTP、ロビー購読
└── utils/                 # ユーティリティ関数
worker/
├── src/                   # Worker のルーター、RoomDO / LobbyDO とその純粋なホスト層
├── test/                  # ホスト層のユニットテスト（integration/ は workerd での結合テスト）
└── wrangler.jsonc         # Worker の設定（Durable Object、vars、本番環境）
e2e/                       # Playwright E2E（複数ブラウザでの対戦・セッションのシナリオ）
docs/realtime/             # リアルタイム基盤の仕様書・実装計画・運用手順書
```

## 開発上の利点

### 1. モジュラー設計

- **分離された関心事**: フロントエンド（Next.js）とリアルタイム通信（Cloudflare Worker）の明確な分離。ゲームとセッションのロジックは純粋な TypeScript で、どちらからも使えます
- **再利用可能なコンポーネント**: `game-card/` パッケージによる独立したカードシステム
- **型安全な通信**: `src/shared/protocol.ts` の zod スキーマをクライアントとサーバーが共有

### 2. スケーラブルな開発環境

- **TypeScript**: 型安全性による早期バグ発見
- **Biome**: 高速なリンティング・フォーマッティング
- **Storybook**: 分離された環境でのコンポーネント開発
- **テスト環境**: Vitest（ユニット + Storybook ブラウザテスト）と Playwright のスクリーンショットによる包括的な検証

### 3. リアルタイム機能

- **Durable Objects**: 部屋ごとに 1 つのオブジェクトが手を 1 つずつ順に処理し、状態を永続化してから配信します
- **状態同期**: 各イベントに連番が付き、再接続時は取りこぼした分を再送（多すぎる場合はスナップショット）します
- **ルーム管理**: 素数の部屋 ID の払い出し、空き部屋の自動削除、デプロイ後も席と手番を維持

### 4. ゲーム特化機能

- **素数計算**: `primes-and-factors` による高速な素数判定
- **カードシステム**: 全54枚のカードを網羅した型安全なシステム
- **ゲームルール**: 純粋で決定的なルールエンジン（`src/game/`）。不正な手はサーバーが拒否します

### 5. 開発効率化

```bash
# 開発サーバー起動
npm run dev            # Next.js（:3000）+ Worker（:8787）を並行起動
npm run dev:web        # Next.js のみ
npm run dev:server     # Worker のみ（wrangler dev、オフラインで動作）

# コード品質管理
npm run biome          # リンティング・フォーマット（自動修正あり、src・worker・e2e）
npm run biome:ci       # CI と同じチェック（biome ci src worker e2e、修正なし）
npm run typecheck      # 型チェック（アプリ・Worker・E2E）

# テスト
npm test               # ユニットテスト（Vitest `unit` プロジェクト。ネットワーク・ブラウザ不要）
npm run test:watch     # ユニットテストの watch モード
npm run test:coverage  # カバレッジ付きユニットテスト（coverage/ に出力）
npm run test:storybook # 全ストーリーをブラウザ（Chromium）で描画して検証
INTEGRATION=1 npm run test:integration  # Worker の結合テスト（ローカルの workerd、実時間で待つので任意）
E2E=1 npm run test:e2e                  # Playwright E2E（wrangler dev + next dev -p 3124 を自動起動）

# ストーリーブック
npm run storybook       # コンポーネント開発環境（:6006）
npm run build-storybook # 静的ビルド
```

#### スクリーンショット

```bash
npm run screens   # デザインギャラリー全シーン + / , /login , /labo/calc を撮影
npm run flights   # カード飛行アニメーションのフレーム連番とコンタクトシート
```

- `npm run screens` は各シーンを 3 つのビューポート（844×390, 390×844, 1440×900）× ライト / ダークで撮影し、`docs/design/screens/<scene>-<w>x<h>-<scheme>.png`（git 管理外）に保存します（現在 96 枚）。再現性のため reduced motion で撮影し、ページエラーやコンソールエラーがあれば終了コード 1 で失敗します。
- `BASE_URL` に何も応答しなければ `next dev -p 3123` を自動で起動・終了します。既存のサーバーを使う場合は `BASE_URL=http://localhost:3000`、一部だけ撮る場合は `SCENES=factor,cut57` を指定します。
- Playwright 同梱の Chromium が無い環境では `PW_CHROMIUM_PATH` に既存の `chrome-headless-shell` のパスを指定します（例: `~/Library/Caches/ms-playwright/chromium_headless_shell-<rev>/chrome-headless-shell-mac-arm64/chrome-headless-shell`）。`npm run test:storybook` も同じブラウザを使います。
- `npm run flights` は `STEPS`, `VIEWPORTS`, `FRAME_MS` で対象と間隔を絞れます。出力先は `docs/design/screens/flights/` です。
- 自動起動する `next dev` はビルド先を `.next-alt` にします（`NEXT_DIST_DIR`）。同じチェックアウトで `npm run dev` が動いていても `.next` を取り合いません。
- `npm run screens` / `npm run flights` は `next dev` だけで動きます。Worker（`:8787`）への接続エラー（ホームのロビー接続など）は想定内として無視し、それ以外のコンソールエラーでは失敗します。
- `next dev` / `next build` は `package-lock.json` を書き換えることがあります。その差分はコミットせずに戻してください。

#### E2E テスト

```bash
E2E=1 npm run test:e2e
E2E=1 E2E_RT_PORT=8799 npm run test:e2e   # :8787 が使用中のとき
```

- `e2e/session.spec.ts` / `lobby.spec.ts`: `alice` と `bob` の 2 つのブラウザコンテキストで、部屋の作成・参加・開始、リロード、回線断（リプレイで復帰）、切断中の自動パス（20 秒上限を短縮した 3 秒）、猶予切れの棄権、二重タブ、退出、ロビーのカウンターを検証します（仕様書 §12.2）。
- `e2e/game.spec.ts`: 3 人で GAME SET まで対局、素因数分解の提出、素数でない提出のペナルティ、途中参加の観戦者が次のラウンドで着席、対局中の Worker の強制終了と再起動（デプロイ相当）からの復帰を検証します。
- Worker（`wrangler dev --local`、短い猶予 `GRACE_PLAYING_MS=5000` など、毎回空にする `.wrangler/e2e-state`）はテスト側のフィクスチャ（`e2e/realtime-server.ts`）が起動し、再起動シナリオで止めて同じ保存先で立ち上げ直します。Next.js は `next dev -p 3124`（ビルド先 `.next-alt`）で自動起動します。どちらも既存のサーバーは再利用しません。
- `E2E=1` を付けないと全テストがスキップされます。Chromium は `PW_CHROMIUM_PATH` で差し替えられます。

### 6. デプロイメント

手順の詳細・環境ごとの設定・ロールバック・動作確認チェックリストは [`docs/realtime/runbook.md`](docs/realtime/runbook.md) にまとめています。

- **順番は Worker が先、Vercel が後**: Worker は 1 つ前のプロトコルバージョンも受け付けるので、先に Worker を出してからフロントエンドを出します。Worker のデプロイで全接続がいったん切れますが、クライアントは約 1 秒で再接続し、席・手札・手番はそのまま残ります。
- **Cloudflare（Worker）**: 推奨は Workers Builds（Git 連携）で `main` から `npx wrangler deploy -c worker/wrangler.jsonc --env production` を実行する方法です（`--env production` を忘れると開発用の設定で別の Worker `prime-daifugo-rt-dev` ができるだけで、本番は置き換わりません）。手動なら `npm run deploy:server`（`--env production`）。本番の `ALLOWED_ORIGINS` は `worker/wrangler.jsonc` の `env.production` に設定し、`workers.dev` ではなくカスタムドメイン（`rt.<domain>`）を推奨します。
- **Vercel（フロントエンド）**: 既存の Git 連携のまま、Production と Preview に `NEXT_PUBLIC_REALTIME_URL` と `ROOMS_SECRET`（Worker の secret と同じ値）を設定します。
- **費用**: Workers Free + Vercel Hobby で趣味の規模なら $0 です。無料枠の上限に達すると UTC 0 時までエラーになるため、Cloudflare の使用量通知を設定します。足りなくなったら Workers Paid（月 $5）に切り替えるのが逃げ道です。
- CI（`.github/workflows/ci.yml`）はビルドと Worker のバンドル確認（dry run）までで、デプロイは行いません。
