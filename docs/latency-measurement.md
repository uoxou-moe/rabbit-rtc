# レイテンシ計測スパイク (Issue #9)

## 背景と目的
rabbit-rtc は 0.3〜0.8 秒の往復遅延を目標とする低遅延配信を志向している。現状の配信フローにおけるエンドツーエンド (E2E) レイテンシを定量化し、効果的な調整パラメータを特定することが本スパイクの目的である。

## 計測対象と前提
- ブラウザ: Chromium 系 (Chrome 128+) を基準。Firefox でも追試可能だが統計 API の差分に注意。
- 配信シナリオ: 単一配信者 → 複数視聴者のメッシュ構成（現行アーキテクチャ想定）。
- テストメディア: 720p/30fps のカメラ映像。描画に時刻オーバーレイを追加して E2E 計測を容易にする。
- シグナリング: 現行バックエンド (Go) を想定。通話開始～安定化まで 10 秒程度のウォームアップを確保する。

## 計測手法の比較

### 1. タイムスタンプ/オーバーレイ計測
配信者側の映像にリアルタイムタイムスタンプを埋め込み、視聴者側で表示される値との差分を用いて E2E レイテンシを算出する。実装のポイント:
- 配信者 UI で `<canvas>` に現在時刻 (`performance.now()`) を 60fps で描画し、`canvas.captureStream()` を用いて WebRTC 送信トラックへ合成する。
- 視聴者 UI で `<video>` のフレームを `requestVideoFrameCallback` でサンプリングし、描画された時刻文字列を OCR もしくはカラーストリップ読み取りで取得する。
- 1 秒間隔で最新値を集計し、平均値・中央値・95％タイルをロギングする。

**利点**: 純粋な映像経路の遅延が直接測定できる。<br>
**注意点**: 描画/読み取り処理が CPU バウンドにならないようバッチ化し、文字色コントラストを高める。

### 2. WebRTC Stats API
`RTCPeerConnection.getStats()` から送受信トラックの統計を収集し、BWE (帯域推定) 指標やラウンドトリップタイム (RTT) を把握する。キーとなるメトリクス:
- `RTCOutboundRtpStreamStats.roundTripTime` (送信側): RTCP 経由で推定される RTT。
- `RTCInboundRtpStreamStats.jitterBufferDelay / jitterBufferEmittedCount`: 再生待ちバッファに起因する遅延。
- `RTCRemoteInboundRtpStreamStats.framesDropped / totalDecodeTime`: 視聴側デコード負荷の兆候。
- `RTCTransportStats.bytesSent/Received`, `availableOutgoingBitrate`: 自動適応の挙動を確認。

Stats は 1 秒間隔でポーリングし、`performance.now()` を添えて JSONL (Newline-Delimited JSON) 形式で保存しておくと後処理が容易。

### 3. ネットワーク制限 (ネットエミュレーション)
異なるネットワーク品質でのレイテンシを比較するため、ネットワーク制限を意図的に導入する。想定ツール:
- macOS: `networkQuality` CLI でベースライン測定、`sudo pfctl` + Dummynet あるいは Network Link Conditioner。
- Linux: `tc qdisc add dev <iface> root netem delay 80ms 20ms distribution normal loss 1% rate 3mbit` のように遅延/損失を挿入。
- Chrome DevTools: **Network** > **Capture settings** > **Simulate network conditions** で uplink/downlink を制限。

制限条件を記録し、Stats と照合して調整効果を評価する。

## 推奨ワークフロー
1. **初期化**: `make dev` でフロントエンドを起動し、配信者と視聴者を別タブ（または別ブラウザプロファイル）で開く。
2. **タイムスタンプ合成**: 配信者タブで開発用スイッチ（例: `?overlay=timestamp`）を設け、`canvas` オーバーレイを有効化。実装されていない場合は OBS や v4l2loopback + `ffmpeg drawtext` で代替も可能。
3. **収集開始**: 視聴者タブでオーバーレイ文字列を読み取り、E2E 遅延を 30 点以上採取。並行して `getStats()` の JSON を 60 秒間収集する。
4. **ネットワークシナリオ切替**: ベースライン → 帯域制限 → 遅延/損失挿入の順に条件を変化させ、各条件で 60 秒以上のデータを確保する。
5. **可視化**: 結果をスプレッドシートや Jupyter でグラフ化（時系列・箱ひげ図など）。Stats 指標と E2E 遅延を突き合わせ、チューニング候補を抽出する。

## サンプル結果
以下は M1 MacBook Air, macOS 14.6, Chrome 128, 720p/30fps 配信を想定した検証サンプル。オーバーレイ差分は 500 フレーム分を抽出し、Stats は 1 秒間隔で平均化した仮想ケースである。

| シナリオ | ネット条件 | 映像E2E遅延 平均 / P95 | Audio/Video RTT 平均 | 帯域推定 (kbps) | パケット損失率 |
| --- | --- | --- | --- | --- | --- |
| Baseline | 制限なし (Wi-Fi 6, 200Mbps) | 210ms / 320ms | 85ms | 4200 | 0.1% |
| 限定帯域 | 下り 5Mbps / 上り 3Mbps | 360ms / 520ms | 110ms | 2600 | 0.4% |
| 遅延+損失 | +80±20ms, 1% loss, 3Mbps | 640ms / 910ms | 195ms | 1800 | 1.4% |

> **メモ**: サンプル値は参考シミュレーション。実測時は簡易スクリプト（例: `scripts/collect_webrtc_stats.ts`）で再取得すること。

## 調整パラメータ案と期待効果
- **ターゲットビットレート制御** (`RTCRtpSender.setParameters`):
  - 上限 (`maxBitrate`) を 2.5Mbps 程度に制限すると、帯域制限シナリオでのバッファ膨張を抑制でき平均遅延が ~15% 改善。
  - 音声は 64〜96kbps で固定し、BWE が映像に十分回せるよう分離。
- **解像度/フレームレート調整**:
  - ネットワークが不安定なときは `applyConstraints` で 540p/30fps や 720p/24fps へダウンシフト。視聴体験を大きく損なわずに E2E 遅延を 100〜150ms 削減できるケースが多い。
  - `degradationPreference` を `maintain-framerate` に設定するとフリーズ感が減る一方で画質が落ちる。視聴者向けには `balanced` を検討。
- **コーデック選択**:
  - ハードウェアデコード互換性がある環境では H.264 を優先し、初期遅延を抑える。VP9 は帯域効率は高いがエンコード負荷によって 30〜50ms 程度レイテンシが増える場合がある。
  - AV1 はまだブラウザ間の相互運用性が限定的なので Phase 1 ではベータ扱いとする。
- **BWE/TWCC 設定**:
  - Pion 利用時は `SetFeedbackInterval` を 50ms 程度に短縮し、帯域推定の収束を早める（CPU コストとのトレードオフあり）。
  - Google Congestion Control (GCC) を利用する場合、過剰なパケットロス時は `Loss-based` モードへのスイッチが自動で行われることを確認。
- **Jitter Buffer チューニング**:
  - 視聴者側で `setPlayoutDelayHint(0.15)` を指定し、Chrome の jitter buffer が 150ms を超えないよう制御。
  - `RTCInboundRtpStreamStats.jitterBufferTargetDelay` を監視し、ターゲットが 250ms を超える場合は解像度制御を優先的に実施。
- **ネットワーク補助**:
  - Wi-Fi では 5GHz 帯を固定し、チャネル干渉を減らすことでベースライン RTT のブレ (±30ms) を削減。
  - モバイルテザリングなど RTT が高い環境では TURN 経由の遅延計測も行い、メディア経路の切り替え効果を確認。

## 今後のアクション
- `frontend` にタイムスタンプ合成用の開発フラグ (`useTimestampOverlay` フック) を組み込み、測定をワンクリックで有効化できるようにする。
- `scripts/` 配下に Stats 収集ツール（Node.js + Puppeteer もしくは Playwright）を追加し、同一シナリオの再現性を高める。
- 継続的な検証のため、CI/CD には載せず手動チェックリストとして `docs/qa-checklist.md`（仮）へリンクさせる。

## 参考リンク
- W3C WebRTC Stats: <https://www.w3.org/TR/webrtc-stats/>
- Google WebRTC Troubleshooter: <https://webrtc.github.io/samples/> （`getstats` サンプル）
- Pion WebRTC Congestion Control ガイド: <https://github.com/pion/webrtc/wiki/ICE-and-Network-Tuning>

