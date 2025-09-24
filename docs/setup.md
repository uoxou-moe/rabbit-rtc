# 開発環境セットアップ

現時点ではリポジトリに実装コードはまだ含まれていませんが、開発を開始する際の前提条件とセットアップ手順のドラフトをまとめています。実装が進み次第、内容を更新してください。

## 前提条件
- Node.js 22.19 以降（LTS）
- npm 10.x もしくは pnpm/yarn 等のパッケージマネージャ
- Go 1.22 以降
- Git、Make（任意）

## 初期セットアップ
```bash
# リポジトリの取得
git clone https://github.com/uoxou-moe/rabbit-rtc.git
cd rabbit-rtc
```

### フロントエンド
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

### バックエンド
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

### 開発環境のホットリロード
- フロントエンドは Vite、バックエンドは `air` などのホットリロードツール利用を検討。
- Docker Compose による統合開発環境は必要に応じて別途整備。

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
- Docker / CI（GitHub Actions）でのセットアップ手順を追加。
- `.env.example` やサンプル設定ファイルを追加し、初期構築を簡易化。
