import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './ViewerPage.css'
import { useViewer } from './useViewer'

function generatePeerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `viewer-${crypto.randomUUID().slice(0, 8)}`
  }

  return `viewer-${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_ROOM_ID = 'demo-room'

const ViewerPage = () => {
  const defaultPeerId = useMemo(() => generatePeerId(), [])
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID)
  const [peerId, setPeerId] = useState(defaultPeerId)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(0.8)

  const videoRef = useRef<HTMLVideoElement | null>(null)

  const { remoteStream, phase, status, lastError, connectionState, connect, disconnect } =
    useViewer({
      room: roomId.trim(),
      peerId: peerId.trim(),
    })

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = volume
  }, [volume])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (remoteStream) {
      video.srcObject = remoteStream
      const playPromise = video.play()
      if (playPromise && typeof playPromise.then === 'function') {
        void playPromise.catch(() => {
          // autoplay restrictions might prevent immediate playback; ignore.
        })
      }
    } else {
      video.srcObject = null
    }
  }, [remoteStream])

  useEffect(() => {
    const handleBeforeUnload = () => {
      disconnect()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      disconnect()
    }
  }, [disconnect])

  const canEditSettings = phase === 'idle'
  const isWatching = phase !== 'idle'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (phase !== 'idle') {
      return
    }
    connect()
  }

  const handleActionClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!isWatching) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      disconnect()
    },
    [disconnect, isWatching],
  )

  const handleMuteToggle = () => {
    setMuted((prev) => !prev)
  }

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (Number.isNaN(value)) {
      return
    }
    setVolume(value)
    if (value > 0 && muted) {
      setMuted(false)
    }
  }

  return (
    <div className="viewer-page">
      <header className="page-header">
        <h1 className="page-title">視聴ページ</h1>
        <p className="page-subtitle">配信者のストリームに接続し、低遅延で視聴します。</p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2 className="panel-title">接続設定</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span className="form-label">ルームID</span>
              <input
                className="input"
                type="text"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
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
                onChange={(event) => setPeerId(event.target.value)}
                disabled={!canEditSettings}
                required
              />
              <span className="form-hint">視聴者としてシグナリングに登録されるIDです。</span>
            </label>

            <div className="form-actions">
              <button
                type={isWatching ? 'button' : 'submit'}
                className={`button ${isWatching ? 'button-danger' : 'button-primary'}`}
                onClick={handleActionClick}
              >
                {isWatching ? '視聴を終了' : '視聴を開始'}
              </button>
            </div>
          </form>

          <div className="status-block">
            <span className="status-label">状態</span>
            <p className="status-text">{status}</p>
            {connectionState ? (
              <p className="status-connection">
                接続ステータス:{' '}
                <span className={`badge badge-${connectionState}`}>{connectionState}</span>
              </p>
            ) : null}
            {lastError ? <p className="status-error">{lastError}</p> : null}
          </div>

          <div className="controls">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleMuteToggle}
              disabled={!remoteStream}
            >
              {muted ? 'ミュート解除' : 'ミュート'}
            </button>
            <label className="slider">
              <span className="slider-label">音量</span>
              <input
                className="slider-input"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolumeChange}
                disabled={!remoteStream}
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">ライブ視聴</h2>
          <div className={`video-wrapper ${remoteStream ? '' : 'video-wrapper--empty'}`}>
            <video ref={videoRef} className="player" playsInline autoPlay controls={false} />
            {!remoteStream ? (
              <p className="video-placeholder">ストリームの受信を待機しています...</p>
            ) : null}
          </div>
          <p className="muted text-small">
            ブラウザの自動再生制限により、音声を再生するには「ミュート解除」を押してください。接続終了後はブラウザのタブを閉じるか、上の
            ボタンで視聴を停止してください。
          </p>
        </section>
      </div>

      <section className="panel">
        <h2 className="panel-title">配信者への接続状況</h2>
        <p className="muted text-small">
          ルームIDとピアIDが配信者と一致している必要があります。配信者がオンラインの場合は自動的に接続が開始されます。
        </p>
        <p className="muted text-small">
          配信者用のページは{' '}
          <a className="link" href="/broadcast">
            /broadcast
          </a>{' '}
          からアクセスできます。
        </p>
      </section>
    </div>
  )
}

export default ViewerPage
