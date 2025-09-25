# シグナリング API 仕様（暫定）

WebRTC のオファー/アンサー/ICE 情報を交換するための暫定的な WebSocket API です。実装と仕様は MVP の検証状況に応じて変更される可能性があります。

## エンドポイント
- URL: `/ws`
- メソッド: `GET`
- クエリパラメータ:
  - `room`: 参加するルームID（必須）
  - `peer`: ピアを一意に識別するID（必須）

```text
ws://localhost:8080/ws?room={ROOM_ID}&peer={PEER_ID}
```

`room` の概念は1つの配信/視聴セッションを表し、同じ `room` に属するピア間でのみメッセージが転送されます。`peer` はルーム内で一意である必要があります。重複するIDで接続した場合、WebSocketは `Policy Violation` で切断されます。

## メッセージ形式
すべてのメッセージは JSON テキストとして送受信されます。

```json
{
  "type": "offer",
  "to": "viewer-1",
  "from": "broadcaster",
  "payload": { "sdp": "..." }
}
```

フィールドの意味は次の通りです。

| フィールド | 必須 | 説明 |
|------------|------|------|
| `type`     | Yes  | メッセージ種別。`offer` / `answer` / `ice` など任意の文字列を想定。 |
| `to`       | No   | 転送先ピアID。未指定の場合は同じルームの他参加者すべてに転送。 |
| `from`     | No   | サーバーが自動付与する送信元ピアID。クライアントから送信する際に設定する必要はありません。 |
| `payload`  | No   | 任意の JSON オブジェクト。SDP や ICE candidate を格納します。 |

### エラーメッセージ
サーバー側でエラーが発生した場合は次の形式で通知されます。

```json
{
  "type": "error",
  "message": "target peer not found"
}
```

主なエラーケース:
- `target peer not found`: `to` で指定したピアが同じルームに存在しない。
- `message type is required`: `type` フィールドが空。
- `invalid message format`: JSON 解析に失敗した。

## 接続/切断時の挙動
- 接続成功時に明示的なシステムメッセージは送信されません。必要に応じて `offer` などのユーザーメッセージでハンドシェイクしてください。
- ピアが切断されるとルームから削除され、メッセージは転送されなくなります。

## 動作確認用クライアント
`backend/cmd/signaling-client` に簡易的なCLIを用意しています。WebSocketに接続し、標準入力から入力したJSON文字列をそのまま送信します。受信したメッセージは標準出力へ表示されます。

```bash
cd backend
go run ./cmd/signaling-client \
  -url ws://localhost:8080/ws \
  -room sample \
  -peer broadcaster
```

ターミナルでJSONを入力すると送信されます。空行を送ると終了します。

## Origin ポリシー
WebSocket 接続時の `Origin` ヘッダーは許可リストで検証されます。

- `SIGNALING_ALLOWED_ORIGINS` 環境変数にカンマ区切りで Origin を指定すると、その値が許可リストになります。
- 環境変数を設定しない場合は `http(s)://localhost` と `http(s)://127.0.0.1` が許可され、ローカル開発を想定した挙動になります。
- 許可されていない Origin からの接続は 403 (Forbidden) で拒否されます。必要に応じて本番環境で明示的に設定してください。
