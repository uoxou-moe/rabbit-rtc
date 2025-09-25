import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import './BroadcastPage.css'
import { useBroadcaster } from './useBroadcaster'

function generatePeerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `broadcaster-${crypto.randomUUID().slice(0, 8)}`
  }

  return `broadcaster-${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_ROOM_ID = 'demo-room'

const BroadcastPage = () => {
  const defaultPeerId = useMemo(() => generatePeerId(), [])
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID)
  const [peerId, setPeerId] = useState(defaultPeerId)

  const videoRef = useRef<HTMLVideoElement | null>(null)

  const {
    localStream,
    phase,
    status,
    lastError,
    viewers,
    audioEnabled,
    videoEnabled,
    start,
    stop,
    toggleAudio,
    toggleVideo,
  } = useBroadcaster({ room: roomId.trim(), peerId: peerId.trim() })

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (localStream) {
      video.srcObject = localStream
      void video.play().catch(() => {
        // ignore autoplay errors in browsers that require user interaction
      })
    } else {
      video.srcObject = null
    }
  }, [localStream])

  useEffect(() => {
    const handleBeforeUnload = () => {
      stop()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      stop()
    }
  }, [stop])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (phase !== 'idle') {
      return
    }
    start()
  }

  const canEditSettings = phase === 'idle'
  const isStreaming = phase !== 'idle'

  return (
    <div className="broadcast-page">
      <header className="page-header">
        <h1 className="page-title">配信者ダッシュボード</h1>
        <p className="page-subtitle">カメラとマイクを共有し、視聴者へストリームを配信します。</p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2 className="panel-title">配信設定</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span className="form-label">ルームID</span>
              <input
                className="input"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                disabled={!canEditSettings}
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label">ピアID</span>
              <input
                className="input"
                type="text"
                value={peerId}
                onChange={(e) => setPeerId(e.target.value)}
                disabled={!canEditSettings}
                required
              />
              <span className="form-hint">視聴者から識別される名前です。英数字で設定してください。</span>
            </label>

            <div className="form-actions">
              {isStreaming ? (
                <button type="button" className="button button-danger" onClick={stop}>
                  配信を終了
                </button>
              ) : (
                <button type="submit" className="button button-primary">
                  配信を開始
                </button>
              )}
            </div>
          </form>

          <div className="status-block">
            <span className="status-label">状態</span>
            <p className="status-text">{status}</p>
            {lastError ? <p className="status-error">{lastError}</p> : null}
          </div>

          <div className="controls">
            <button
              type="button"
              className="button button-secondary"
              onClick={toggleAudio}
              disabled={!localStream}
            >
              {audioEnabled ? 'マイクをミュート' : 'マイクをオン'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={toggleVideo}
              disabled={!localStream}
            >
              {videoEnabled ? 'カメラを停止' : 'カメラを再開'}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">ローカルプレビュー</h2>
          <div className="video-wrapper">
            <video ref={videoRef} className="preview" playsInline muted autoPlay />
          </div>
          <p className="muted text-small">
            ブラウザでのプレビューは常にミュートされます。配信停止後はブラウザ上でメディアデバイスのランプが消灯することを確認してください。
          </p>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel-title">視聴者接続</h2>
        {viewers.length === 0 ? (
          <p className="muted">現在接続中の視聴者はいません。</p>
        ) : (
          <table className="viewer-table">
            <thead>
              <tr>
                <th>ピアID</th>
                <th>接続状態</th>
              </tr>
            </thead>
            <tbody>
              {viewers.map((viewer) => (
                <tr key={viewer.peerId}>
                  <td>{viewer.peerId}</td>
                  <td>
                    <span className={`badge badge-${viewer.connectionState}`}>
                      {viewer.connectionState}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted text-small">
          視聴者が `/watch` 画面から参加すると、自動的にオファーを送信します。複数の視聴者を同時にサポートします。
        </p>
      </section>
    </div>
  )
}

export default BroadcastPage
