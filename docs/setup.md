# 開発環境セットアップ

バックエンド（Go 1.22）の最小実装が含まれています。以下は開発を開始するための前提条件とセットアップ手順です。実装が進み次第、内容を更新してください。

## 前提条件
- Node.js 22.19 以降（LTS）
- npm 10.x もしくは pnpm/yarn 等のパッケージマネージャ
- Go 1.22 以降
- Git、Make（任意）
- Docker 24.x 以降と Docker Compose v2（コンテナ開発を行う場合）

## 初期セットアップ
```bash
# リポジトリの取得
git clone https://github.com/uoxou-moe/rabbit-rtc.git
cd rabbit-rtc
```

### フロントエンド（ローカル実行）
1. `frontend/` は React + Vite（TypeScript テンプレート）で初期化済みです。
2. 初回セットアップ:
   ```bash
   cd frontend
   npm install
   npm run dev
   npm run build
   npm run lint
   ```
3. `.env` や設定ファイルが必要になった場合は `frontend/.env.example` を整備してください。

### バックエンド（ローカル実行）
1. `backend/` には Go モジュールが初期化済みです。ヘルスチェックエンドポイントを備えた HTTP サーバを `cmd/server` で提供しています。
   ```bash
   # テスト実行
   cd backend
   go test ./...

   # サーバ起動
   go run ./cmd/server
   ```
2. `PORT` 環境変数を設定するとリッスンポートを変更できます（デフォルトは 8080）。ヘルスチェックは `GET /healthz` で確認できます。
3. 将来的に WebSocket シグナリングと WebRTC 処理（例: `pion/webrtc`）を追加予定です。

### コンテナベースの開発

バックエンドとフロントエンドそれぞれに `Dockerfile` を用意しています。個別にビルド/起動する場合の例は以下の通りです。

```bash
# バックエンド
docker build -t rabbit-backend ./backend
docker run --rm -p 8080:8080 \
  -e SIGNALING_ALLOWED_ORIGINS="http://localhost:5173" \
  rabbit-backend

# フロントエンド
docker build -t rabbit-frontend ./frontend
docker run --rm -it -p 5173:5173 \
  -e VITE_SIGNALING_WS_URL="ws://localhost:8080/ws" \
  rabbit-frontend
```

ローカルで一括起動したい場合はリポジトリルートの `docker-compose.yml` を利用します。

```bash
# 初回は --build を付与してイメージ作成
docker compose up --build
```

- `backend` サービスは `PORT=8080` で起動し、`SIGNALING_ALLOWED_ORIGINS` を `http://localhost:5173,http://127.0.0.1:5173` に設定します。
- `frontend` サービスは `VITE_SIGNALING_WS_URL=ws://backend:8080/ws` を環境変数で注入し、ホットリロードのために `./frontend` ディレクトリをマウントします。
- 追加の環境変数を注入したい場合は `.env` ファイル（Compose の標準仕様）もしくは `--env-file` オプションを使用してください。

コード変更後に再ビルドする場合は `docker compose up --build <service>` で対象サービスのみ更新できます。バックエンドはマルチステージビルドで静的バイナリを生成するため、ホットリロードが必要な場合はローカル Go ツールチェーンの利用が推奨です。

## テスト
- フロントエンド: Vitest と React Testing Library を導入予定。
- バックエンド: Go 標準の `testing` パッケージでユニットテストを実施。

## デプロイ（Vercel + Fly.io）
- フロントエンド: `npm run build` で生成した静的ファイルを Vercel にデプロイ。GitHub 連携で自動デプロイを設定する。
- バックエンド: Fly.io 用に `Dockerfile` を用意し、`fly launch` -> `fly deploy` で Go サーバを公開。HTTPS/WS 対応は Fly が自動付与。
- TURN サーバ: 別アプリとして `coturn` コンテナを Fly.io にデプロイし、環境変数で資格情報を管理。
- DNS: Vercel の自動証明書を利用するか、独自ドメインをCNAMEで Vercel/Fly に割り当てる。

> 詳細な手順は今後 Dockerfile やCI設定が整い次第追記する。

## 今後の TODO
- 実際のディレクトリ構成とスクリプトが確定したら、本書のサンプルコマンドを最新のものに更新。
- CI 向けの Docker / GitHub Actions 手順を整備。
- `.env.example` やサンプル設定ファイルを追加し、初期構築を簡易化。
