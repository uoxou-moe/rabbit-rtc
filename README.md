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

## フロントエンド開発 (React + Vite)
開発に必要なコマンドは以下の通りです。

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

開発サーバは `npm run dev` で起動し、[http://localhost:5173](http://localhost:5173) でアクセスできます。

## バックエンド開発 (Go)
`Makefile` を利用すると Go サーバのビルドや起動が簡単です。

![Lint Status](https://github.com/uoxou-moe/rabbit-rtc/actions/workflows/lint.yml/badge.svg)

```bash
make backend/run   # サーバ起動 (デフォルトは http://localhost:8080)
make backend/build # バイナリビルド
make backend/test  # テスト実行
```

環境変数 `PORT` を指定するとリッスンポートを変更できます。ヘルスチェックは `GET /healthz` にアクセスしてください。

## ドキュメント
- `docs/architecture.md` : システム構成と通信フロー、レイテンシ要件。
- `docs/setup.md` : 開発環境の構築手順と起動方法。
- `docs/roadmap.md` : 今後の実装計画とバックログ。
- `docs/tech-stack.md` : 採用技術と候補技術のメモ。

## ライセンス
このプロジェクトは [MIT License](LICENSE) の下で公開されています。
