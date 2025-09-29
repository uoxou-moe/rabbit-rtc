# Repository Guidelines

## **作業の際**

作業を始める前に `/plan` ディレクトリに計画を記載してください。計画は以下を参考にしてください。

### Planning Workflow
- Create a Markdown plan under `plan/<topic>.md` before implementation.
- Break initiatives into the smallest actionable tasks and track them with checkbox lists (`- [ ] Task`).
- Mark checkboxes as each implementation phase completes so progress stays transparent.
- Update the checklists as work progresses so reviewers can see status at a glance.

## プロジェクト構成とモジュール
- **`backend/`**: Go 1.22 の サーバー 実装。 `cmd/server` が エントリーポイント で `internal/server` `internal/signaling` に HTTP と WebRTC ロジック を 配置。
- **`frontend/`**: Vite + React + TypeScript クライアント。 UI コンポーネント は `src/features` 配下 に まとまり、 テスト は 各 フィーチャー 直下 の `*.test.ts` に 近接 配置。
- **`docs/`**: 設計 と 手順 を 記載 した 参照 ドキュメント。 新規 仕様 を 追記 する 場合 は 既存 ファイル を 更新 し 体系化 を 維持。
- **`scripts/`**: 自動化 スクリプト の 置き場。 必要 な もの が 無ければ 空 の 場合 も ある が 新規 追加 は シェル 互換 を 意識。
- **`frontend/dist`**, `frontend/node_modules`: 生成物 と 依存 を 含む ため コミット しない。

## ビルド・テスト・開発コマンド
- **`make install`**: フロントエンド の npm 依存 を 一括 インストール。
- **`make dev`**: Vite 開発 サーバー を 起動 し `localhost:5173` で フロント を プレビュー。
- **`make backend/run`**: Go サーバー を 起動。 `.env` など 必要 な 設定 を ローカル に 用意。
- **`make build`**: フロント `npm run build` と バックエンド `go build` を まとめて 実行 し デプロイ 用 成果物 を 生成。
- **`make test`**: `vitest run` と `go test ./...` を ラップ し 主要 モジュール の 回帰 を 確認。

## コーディング規約と命名
- **フォーマット**: Go は `gofmt`, フロント は `prettier` と `eslint`。 修正 前 に `make lint`、 自動 整形 が 必要 な 場合 `make lint-fix` や `make format-fix` を 使用。
- **命名**: React コンポーネント は PascalCase、 フック は `use` 接頭辞、 CSS は ケバブケース。 Go の パッケージ 名 は 小文字 単語、 エクスポート には パスカルケース を 用いる。
- **型**: TypeScript strict 設定 を 想定。 明示 的 な 型 推論 を 尊重 し つつ 公開 API には 明示 的 型 注釈 を 付与。

## テスト方針
- **Go テスト**: `*_test.go` を `backend/internal/...` に 近接 し 高速 ユニット テスト を 優先。 WebSocket や シグナリング の 副作用 は `testing` と `net/http/httptest` で 模擬。
- **フロント テスト**: `vitest` + `jsdom`。 コンポーネント は `*.test.tsx`、 Hooks は `*.test.ts` と し 状態 遷移 と 非同期 を テスト。 `npm run test:watch` で TDD を 実施。
- **カバレッジ**: クリティカル な シグナリング 経路 と ブロードキャスト フロー は レグレッション を 防ぐ ため 常に テスト を 更新。

## コミット と プルリクエスト
- **コミット メッセージ**: `feat:`, `fix:`, `format` など の プレフィックス と 短い 命令形 概要 を 推奨。 スコープ を 明示 する 場合 は `scope: message` を 参考 に。
- **プルリク 要件**: 変更 背景、 テスト 結果、 関連 Issue を 記載。 UI 変更 は スクリーンショット、 API 変更 は `docs/` 更新 を 添付。
- **レビュー**: 小さな PR を 心掛け、 影響 範囲 を 箇条書き で 明示。 レビュアー の コメント には 24 時間 以内 の フォローアップ を 目指す。
