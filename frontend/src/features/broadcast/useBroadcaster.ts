import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

type BroadcastPhase = 'idle' | 'preparing-media' | 'connecting' | 'ready'

type ViewerSummary = {
  peerId: string
  connectionState: RTCPeerConnectionState
}

type SignalingMessage = {
  type: string
  from?: string
  to?: string
  payload?: unknown
}

interface UseBroadcasterOptions {
  room: string
  peerId: string
}

interface UseBroadcasterResult {
  localStream: MediaStream | null
  phase: BroadcastPhase
  status: string
  lastError: string | null
  viewers: ViewerSummary[]
  audioEnabled: boolean
  videoEnabled: boolean
  start: () => Promise<void>
  stop: () => void
  toggleAudio: () => void
  toggleVideo: () => void
}

function buildSignalingUrl(room: string, peerId: string) {
  const base = (import.meta.env.VITE_SIGNALING_WS_URL as string | undefined)?.trim()
  const query = new URLSearchParams({ room, peer: peerId }).toString()

  if (base && base.length > 0) {
    const separator = base.includes('?') ? '&' : '?'
    return `${base}${separator}${query}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${protocol}://${host}/ws?${query}`
}

export function useBroadcaster({ room, peerId }: UseBroadcasterOptions): UseBroadcasterResult {
  const [phase, setPhase] = useState<BroadcastPhase>('idle')
  const [status, setStatus] = useState('準備待ち')
  const [lastError, setLastError] = useState<string | null>(null)
  const [viewers, setViewers] = useState<ViewerSummary[]>([])
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const connectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const unmountedRef = useRef(false)

  const resetViewers = useCallback(() => {
    connectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.close()
    })
    connectionsRef.current.clear()
    setViewers([])
  }, [])

  const closeSocket = useCallback(() => {
    const socket = socketRef.current
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(1000, 'broadcast finished')
    }
    socketRef.current = null
  }, [])

  const stopTracks = useCallback(() => {
    const stream = streamRef.current
    if (!stream) {
      return
    }
    stream.getTracks().forEach((track) => {
      track.stop()
    })
    streamRef.current = null
    setLocalStream(null)
  }, [])

  const stop = useCallback(() => {
    resetViewers()
    closeSocket()
    stopTracks()
    setPhase('idle')
    setStatus('配信を終了しました')
  }, [closeSocket, resetViewers, stopTracks])

  const updateViewerState = useCallback((peer: string, connectionState?: RTCPeerConnectionState) => {
    setViewers((current) => {
      const others = current.filter((entry) => entry.peerId !== peer)
      if (!connectionState) {
        return others
      }
      return [...others, { peerId: peer, connectionState }]
    })
  }, [])

  const sendMessage = useCallback(
    (message: Record<string, unknown>) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('Signaling socket is not open; skipping message', message)
        return
      }
      socket.send(JSON.stringify(message))
    },
    [],
  )

  const removeViewer = useCallback(
    (viewerId: string, reason: string) => {
      const pc = connectionsRef.current.get(viewerId)
      if (pc) {
        pc.onicecandidate = null
        pc.onconnectionstatechange = null
        pc.close()
        connectionsRef.current.delete(viewerId)
      }
      updateViewerState(viewerId)
      console.info(`viewer ${viewerId} disconnected (${reason})`)
    },
    [updateViewerState],
  )

  const handleViewerAnswer = useCallback(async (viewerId: string, payload: unknown) => {
    const pc = connectionsRef.current.get(viewerId)
    if (!pc || !payload || typeof payload !== 'object') {
      return
    }

    const description = payload as RTCSessionDescriptionInit
    if (!description.sdp || !description.type) {
      return
    }

    try {
      await pc.setRemoteDescription(description)
    } catch (error) {
      console.error('Failed to set remote description', error)
      setLastError('視聴者からの応答を適用できませんでした')
      removeViewer(viewerId, 'setRemoteDescription failed')
    }
  }, [removeViewer])

  const handleViewerIce = useCallback(async (viewerId: string, payload: unknown) => {
    const pc = connectionsRef.current.get(viewerId)
    if (!pc || !payload || typeof payload !== 'object') {
      return
    }

    const candidate = payload as RTCIceCandidateInit
    try {
      await pc.addIceCandidate(candidate)
    } catch (error) {
      console.error('Failed to add ICE candidate', error)
      setLastError('ICE candidate の適用に失敗しました')
    }
  }, [])

  const createPeerConnection = useCallback(
    (viewerId: string) => {
      if (!streamRef.current) {
        setLastError('ローカルメディアが利用できません')
        return null
      }

      let pc = connectionsRef.current.get(viewerId)
      if (pc) {
        return pc
      }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      connectionsRef.current.set(viewerId, pc)
      updateViewerState(viewerId, pc.connectionState)

      streamRef.current.getTracks().forEach((track) => {
        pc?.addTrack(track, streamRef.current as MediaStream)
      })

      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          return
        }
        sendMessage({ type: 'ice', to: viewerId, payload: event.candidate })
      }

      pc.onconnectionstatechange = () => {
        if (!pc) {
          return
        }
        updateViewerState(viewerId, pc.connectionState)
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          removeViewer(viewerId, `connection state ${pc.connectionState}`)
        }
      }

      return pc
    },
    [removeViewer, sendMessage, updateViewerState],
  )

  const handleViewerJoin = useCallback(
    async (viewerId: string) => {
      const pc = createPeerConnection(viewerId)
      if (!pc) {
        return
      }

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
        await pc.setLocalDescription(offer)
        sendMessage({ type: 'offer', to: viewerId, payload: offer })
        setStatus('視聴者にオファーを送信しました')
      } catch (error) {
        console.error('Failed to create offer', error)
        setLastError('オファー生成に失敗しました')
        removeViewer(viewerId, 'createOffer failed')
      }
    },
    [createPeerConnection, removeViewer, sendMessage],
  )

  const handleMessage = useCallback(
    (raw: string) => {
      let message: SignalingMessage
      try {
        message = JSON.parse(raw) as SignalingMessage
      } catch (error) {
        console.warn('Received malformed signaling payload', raw, error)
        return
      }

      const sender = message.from
      switch (message.type) {
        case 'viewer-ready':
        case 'viewer-join':
          if (sender) {
            void handleViewerJoin(sender)
          }
          break
        case 'answer':
          if (sender) {
            void handleViewerAnswer(sender, message.payload)
          }
          break
        case 'ice':
          if (sender) {
            void handleViewerIce(sender, message.payload)
          }
          break
        case 'viewer-left':
        case 'bye':
          if (sender) {
            removeViewer(sender, 'viewer requested disconnect')
          }
          break
        case 'error':
          if (typeof message.payload === 'object' && message.payload && 'message' in (message.payload as Record<string, unknown>)) {
            const description = (message.payload as { message?: string }).message
            setLastError(description ?? 'シグナリングサーバからエラーを受信しました')
          } else {
            setLastError('シグナリングサーバからエラーを受信しました')
          }
          break
        default:
          console.info('Received unsupported signaling message', message)
      }
    },
    [handleViewerAnswer, handleViewerIce, handleViewerJoin, removeViewer],
  )

  const start = useCallback(async () => {
    if (phase !== 'idle') {
      return
    }

    setPhase('preparing-media')
    setStatus('カメラとマイクへのアクセスをリクエストしています...')
    setLastError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      setLocalStream(stream)
      const audioTrack = stream.getAudioTracks()[0]
      const videoTrack = stream.getVideoTracks()[0]
      setAudioEnabled(audioTrack ? audioTrack.enabled : false)
      setVideoEnabled(videoTrack ? videoTrack.enabled : false)
    } catch (error) {
      console.error('Failed to acquire media devices', error)
      setLastError('カメラ・マイクの取得に失敗しました。ブラウザの権限設定を確認してください。')
      setPhase('idle')
      setStatus('メディアデバイスを利用できません')
      stopTracks()
      return
    }

    setPhase('connecting')
    setStatus('シグナリングサーバへ接続中...')

    const url = buildSignalingUrl(room, peerId)
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      if (unmountedRef.current) {
        socket.close()
        return
      }
      setPhase('ready')
      setStatus('接続しました。視聴者からの参加を待機しています。')
      sendMessage({ type: 'broadcaster-ready' })
    }

    socket.onmessage = (event) => {
      handleMessage(event.data)
    }

    socket.onerror = (event) => {
      console.error('Signaling socket error', event)
      setLastError('シグナリング通信でエラーが発生しました')
    }

    socket.onclose = () => {
      if (unmountedRef.current) {
        return
      }
      resetViewers()
      socketRef.current = null
      setStatus('シグナリング接続が切断されました')
      setPhase('idle')
    }
  }, [handleMessage, peerId, phase, room, resetViewers, sendMessage, stopTracks])

  const toggleAudio = useCallback(() => {
    const stream = streamRef.current
    if (!stream) {
      return
    }
    const tracks = stream.getAudioTracks()
    if (tracks.length === 0) {
      return
    }
    const enabled = !tracks[0].enabled
    tracks.forEach((track) => {
      track.enabled = enabled
    })
    setAudioEnabled(enabled)
  }, [])

  const toggleVideo = useCallback(() => {
    const stream = streamRef.current
    if (!stream) {
      return
    }
    const tracks = stream.getVideoTracks()
    if (tracks.length === 0) {
      return
    }
    const enabled = !tracks[0].enabled
    tracks.forEach((track) => {
      track.enabled = enabled
    })
    setVideoEnabled(enabled)
  }, [])

  useEffect(() => {
    return () => {
      unmountedRef.current = true
      stop()
    }
  }, [stop])

  return useMemo(
    () => ({
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
    }),
    [audioEnabled, lastError, localStream, phase, start, status, stop, toggleAudio, toggleVideo, videoEnabled, viewers],
  )
}
