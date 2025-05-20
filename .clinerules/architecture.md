# Architecture

このドキュメントは、このプロジェクトのアーキテクチャに関する情報を提供します。

## 主要なコンポーネント

- frontend
  - Next.JS
  - tailwind CSS
    - DaisyUI
  - Mantine UI
    - 将来的に外す予定
- backend
  - PartyKit
- DB
- Auth

## プロジェクトの要件

- 「素数大富豪のルール」
  - `README.md`に記載

## 基盤となるデータフロー

- ゲームステータス
  - partykit の storage に保存
  - frontend から partykit の websocket を通じて,
    - ゲームの状態を取得
    - ゲームの状態を更新
- 計算処理
  - ゲームロジックはすべて backend で実行
    - frontend は、backend の計算結果を表示する
