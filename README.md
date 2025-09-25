# rabbit-rtc

ゲーム配信を対象とした学習用途のWebアプリケーションです。WebRTCを活用して配信者と最大10名を想定した視聴者間で低遅延のストリーミング体験を提供することを目指しています。

## プロジェクト概要
- フロントエンドは TypeScript + React を採用予定。
- バックエンドは Go を採用し、シグナリングサーバやメディア制御を担当。
- 配信はライブ配信のみを対象とし、録画・アーカイブ機能は対象外。
- シンプルなUI/UXで検証を行いつつ、学習を目的とした小規模な運用（同時10ユーザー程度）を想定。

## MVPに含める機能
- 配信者が映像・音声をブラウザから配信できる。
- 視聴者がブラウザからライブ配信を視聴できる。

## バックログ
- コメント（チャット）機能。
- ユーザー認証・ログイン機能。
- 配信管理機能（スケジュール、アーカイブ等）。

## 環境セットアップ（概要）
詳細な手順は `docs/setup.md` を参照してください。現時点の前提は以下の通りです。

1. Node.js 22.19 以降（もしくはそれに準ずる LTS）をインストール。
2. Go 1.22 以降をインストール。
3. リポジトリをクローン後、フロントエンド・バックエンドの依存関係を導入。
4. 開発サーバやバックエンドサーバを個別に起動し、WebRTC接続を確認。

## 開発コマンド一覧
プロジェクトルートで `make` コマンドを実行すると、よく使う開発フローをまとめて呼び出せます。

```bash
make install       # フロントエンド依存関係をインストール
make dev           # フロントエンド開発サーバを起動
make build         # フロントエンド/バックエンドをビルド
make test          # フロントエンド（存在すれば）とバックエンドのテスト
make lint          # ESLint と gofmt チェック
make lint-fix      # ESLint --fix + gofmt で整形
make format        # Prettier チェック + gofmt チェック
make format-fix    # Prettier --write + gofmt で整形

# 個別ターゲット
make frontend/dev  # npm run dev
make backend/run   # Go サーバ起動 (http://localhost:8080)
```

## フロントエンド開発 (React + Vite)
`make dev` で開発サーバが起動し、[http://localhost:5173](http://localhost:5173) からアクセスできます。
配信者用UIは [http://localhost:5173/broadcast](http://localhost:5173/broadcast) で利用できます。
バックエンドと別ポートで動かす場合は `VITE_SIGNALING_WS_URL` を設定してシグナリング先を上書きできます（例: `VITE_SIGNALING_WS_URL=ws://localhost:8080/ws npm run dev`）。
CI と同じチェックは `make lint` / `make format` / `make test` で再現できます。

## バックエンド開発 (Go)
ヘルスチェックエンドポイント付きの HTTP サーバを `make backend/run` で起動できます。環境変数 `PORT` でポート指定 (`8080` がデフォルト)、ヘルスチェックは `GET /healthz` で確認します。
簡易的なシグナリング検証クライアントは `go run ./cmd/signaling-client -room sample -peer broadcaster` で起動できます（`backend` ディレクトリ配下）。
WebSocket シグナリングは `SIGNALING_ALLOWED_ORIGINS` 環境変数（カンマ区切り）で許可する Origin を設定できます。未設定時は `localhost` / `127.0.0.1` のみ許可されます。

[![Frontend](https://github.com/uoxou-moe/rabbit-rtc/actions/workflows/frontend.yml/badge.svg)](https://github.com/uoxou-moe/rabbit-rtc/actions/workflows/frontend.yml)
[![Backend](https://github.com/uoxou-moe/rabbit-rtc/actions/workflows/backend.yml/badge.svg)](https://github.com/uoxou-moe/rabbit-rtc/actions/workflows/backend.yml)


## ドキュメント
- `docs/architecture.md` : システム構成と通信フロー、レイテンシ要件。
- `docs/setup.md` : 開発環境の構築手順と起動方法。
- `docs/roadmap.md` : 今後の実装計画とバックログ。
- `docs/tech-stack.md` : 採用技術と候補技術のメモ。
- `docs/signaling-api.md` : WebRTC シグナリング WebSocket の暫定仕様。

## ライセンス
このプロジェクトは [MIT License](LICENSE) の下で公開されています。
