# ロードマップ

rabbit-rtc の開発ロードマップを管理するためのドキュメントです。優先度の高いタスクをフェーズごとに整理し、バックログも併記します。

## フェーズ構成
- フェーズ0: プロジェクト基盤（セットアップと基盤整備）
- フェーズ1: MVP（ライブ配信 & 視聴）
- フェーズ2: 開発体験向上（DX/運用拡張）
- バックログ: 将来候補（優先度低/調査前）

## ラベル運用
- `phase:0`: フェーズ0（プロジェクト基盤）に属するIssue
- `phase:1`: フェーズ1（MVP）に属するIssue
- `phase:2`: フェーズ2（DX/運用拡張）に属するIssue
- `backlog`: バックログ項目（着手未定/調査前）
- 既存の補助ラベルと併用: `enhancement`, `technical`, `qa`, `research`, `documentation`, `bug`

## フェーズ0: プロジェクト基盤
- [ ] フロントエンド環境（React + Vite など）の初期化
- [ ] バックエンド環境（Go モジュール、ベーシックサーバ）の初期化
- [ ] コーディング規約・フォーマッタ設定（ESLint/Prettier、gofmt等）
- [ ] 基本的なCI（Lint/テスト）パイプラインの整備
- [ ] 開発コマンドの整備（Makefile や npm scripts）

## フェーズ1: MVP（ライブ配信 & 視聴）
- [ ] WebRTC シグナリング API の実装（WebSocket）
- [ ] 配信者用 UI の実装（映像・音声の取得と送信）
- [ ] 視聴者用 UI の実装（ストリーム再生）
- [ ] レイテンシ測定と調整方針の検証
- [ ] 基本的なエラーハンドリングとログ出力

## フェーズ2: 開発体験向上 (拡張)
- [ ] Docker / Docker Compose による開発環境の統合
- [ ] 自動テスト基盤の拡張（カバレッジやE2Eなど）
- [ ] モニタリングやアラートの整備
- [ ] デプロイパイプライン整備（Vercel / Fly.io）

## バックログ
- [ ] コメント機能（リアルタイムチャット）
- [ ] ユーザー認証・ログイン
- [ ] 配信スケジュールやアーカイブ管理
- [ ] TURN サーバや SFU 導入による安定性向上
- [ ] モバイル最適化 UI

進捗の更新やタスクの詳細は GitHub Issue / Projects と連携して管理してください。

## Issue の一括生成
- スクリプト: `scripts/create_roadmap_issues.sh`
- 前提: GitHub CLI `gh` が利用可能で、`gh auth login` 済み
- 実行例:
  - `bash scripts/create_roadmap_issues.sh`（カレントが対象リポジトリ）
  - `REPO=owner/repo bash scripts/create_roadmap_issues.sh`（明示指定）
- 付与ラベル: フェーズ別 `phase:*` と用途別ラベル（`enhancement`/`technical`/`qa`/`research` など）
- 任意: `CREATE_PROJECT=true` を付与すると Projects v2 への追加も試行します（環境によりスキップされる場合あり）。
