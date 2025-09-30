# Issue #10 基本的なエラーハンドリングとログ出力

## スコープ確認
- [x] docs/roadmap.md と Issue #10 の要求を精読
- [x] 既存のエラーハンドリング/ログ実装を把握（backend, frontend）

## 失敗ケース洗い出しと設計
- [x] 想定失敗シナリオを整理（接続失敗/切断/デバイス未許可 等）
- [x] 各シナリオのハンドリング方針とユーザ通知方式を決定
- [x] ログレベルポリシーとフォーマットの草案を作成

### 主要シナリオ（ドラフト）
- getUserMedia 拒否/未対応
- シグナリング接続失敗・切断（初回/途中）
- 視聴者/配信者側の peer connection 失敗
- シグナリングメッセージ解析失敗 or エラー通知受信
- ICE candidate 追加失敗
- 予期しないサーバエラー（500系）

### ハンドリング方針（ドラフト）
- getUserMedia 失敗: 状態リセット + トーストで権限チェック案内 + error ログ
- WebSocket 接続/切断: close code/reason を含む warn ログ + トーストで再試行提示
- PeerConnection 失敗: 該当ピアをクリーンアップし error ログ + 視聴者/配信者へ通知
- シグナリングエラー通知: payload を検証しユーザ向けにメッセージ表示
- ICE candidate 追加失敗: warn ログ + 視聴品質低下の可能性を UI で簡易表示

### ログポリシー（ドラフト）
- backend: slog に統一し LOG_LEVEL/LOG_FORMAT env で制御、component フィールドで分類
- frontend: createLogger(scope) で log level 統一、VITE_LOG_LEVEL env で動的制御
- error レベルは常に通知、warn は必要に応じトーストとし、debug は DEV でのみ出力

## 実装計画
- [x] backend: ロギング基盤と代表的なエラー分岐の整備
- [x] frontend: ユーザ通知コンポーネント/トーストの原型実装
- [x] frontend: 主要操作でのエラー捕捉と通知/ログ連携

## 検証・ドキュメント
### テストメモ
- go test ./...
- npm run test
- ブラウザ手動確認: メディア拒否・シグナリング切断時のトースト表示

- [x] 手動テスト/再現手順を整理
- [x] 追加したロギング・ハンドリングを README か docs に反映
- [x] 完了条件のセルフチェックと Issue 更新

## フォローアップ
### フォローアップメモ
- 自動再接続フローや重複トースト抑制の検討
- WebSocket 切断時の再試行 UI（ボタン等）の追加検討

- [x] レビュー観点・残タスクを洗い出し
