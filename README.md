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
4. Docker（24.x 以降推奨）と Docker Compose v2 が利用可能だと、コンテナベースの開発が簡単になります。
5. 開発サーバやバックエンドサーバを個別に起動し、WebRTC接続を確認。

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

## コンテナ開発環境 (Docker / Docker Compose)

### バックエンドコンテナ
`backend/` にはマルチステージ構成の `Dockerfile` を追加しています。Go バイナリをビルドし、distroless ベースイメージに格納します。

```bash
# イメージのビルド
docker build -t rabbit-backend ./backend

# コンテナの起動
docker run --rm -p 8080:8080 \
  -e SIGNALING_ALLOWED_ORIGINS="http://localhost:5173" \
  rabbit-backend
```

起動時は `PORT` 環境変数でポート指定が可能です（デフォルト `8080`）。`SIGNALING_ALLOWED_ORIGINS` はカンマ区切りで Origin を列挙します。

### フロントエンドコンテナ
`frontend/` の `Dockerfile` では Node.js 22 ベースで依存をインストールし、Vite 開発サーバを `0.0.0.0:5173` で公開します。

```bash
docker build -t rabbit-frontend ./frontend
docker run --rm -it -p 5173:5173 \
  -e VITE_SIGNALING_WS_URL="ws://localhost:8080/ws" \
  rabbit-frontend
```

`VITE_SIGNALING_WS_URL` を上書きすることで、接続先シグナリングサーバを切り替えられます。

### Docker Compose での統合起動
ルートには `docker-compose.yml` を用意しています。以下でバックエンドとフロントエンドを同時に起動できます。

```bash
docker compose up --build
```

初回はイメージをビルドし、2 回目以降は差分のみ再ビルドします。`docker compose up --build backend` のようにサービスを指定すると片方のみ再構築できます。

Compose はデフォルトで以下の設定を行います。

- `backend` サービス: `SIGNALING_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
- `frontend` サービス: `VITE_SIGNALING_WS_URL=ws://backend:8080/ws`
- フロントエンドのソースコードはボリュームマウントされ、Vite のホットリロードが利用できます。

追加の環境変数を設定したい場合は、`docker compose --env-file` もしくは `.env` ファイル（プロジェクトルート）で上書きしてください。

## フロントエンド開発 (React + Vite)
`make dev` で開発サーバが起動し、[http://localhost:5173](http://localhost:5173) からアクセスできます。
配信者用UIは [http://localhost:5173/broadcast](http://localhost:5173/broadcast) で利用できます。
バックエンドをプロキシせず別ポートで動かす場合は `VITE_SIGNALING_WS_URL` を設定してシグナリング先を上書きしてください（例: `VITE_SIGNALING_WS_URL=ws://localhost:8080/ws npm run dev`）。未設定時は開発環境では `ws://<host>:8080/ws`、本番ではページのホストをそのまま利用します。
コンソールログは `VITE_LOG_LEVEL` (`debug`/`info`/`warn`/`error`) で制御でき、開発時は `debug` がデフォルトです。
CI と同じチェックは `make lint` / `make format` / `make test` で再現できます。

## バックエンド開発 (Go)
ヘルスチェックエンドポイント付きの HTTP サーバを `make backend/run` で起動できます。環境変数 `PORT` でポート指定 (`8080` がデフォルト)、ヘルスチェックは `GET /healthz` で確認します。
簡易的なシグナリング検証クライアントは `go run ./cmd/signaling-client -room sample -peer broadcaster` で起動できます（`backend` ディレクトリ配下）。
WebSocket シグナリングは `SIGNALING_ALLOWED_ORIGINS` 環境変数（カンマ区切り）で許可する Origin を設定できます。未設定時は `localhost` / `127.0.0.1` のみ許可されます。

ログ出力は `LOG_LEVEL` (`debug`/`info`/`warn`/`error`) と `LOG_FORMAT` (`text` or `json`) で制御できます。詳細なスタックトレースが必要な場合は `LOG_ADD_SOURCE=true` を設定してください。

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
