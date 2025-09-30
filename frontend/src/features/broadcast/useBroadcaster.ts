import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../notifications/ToastContext'
import { createLogger } from '../../lib/logger'
import { describeError } from '../../lib/errors'

const logger = createLogger('useBroadcaster')

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

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

export function buildSignalingUrl(room: string, peerId: string) {
  const base = (import.meta.env.VITE_SIGNALING_WS_URL as string | undefined)?.trim()
  const query = new URLSearchParams({ room, peer: peerId }).toString()

  if (base && base.length > 0) {
    const separator = base.includes('?') ? '&' : '?'
    return `${base}${separator}${query}`
  }

  const { protocol: pageProtocol, hostname, port } = window.location
  const isSecure = pageProtocol === 'https:'
  const wsProtocol = isSecure ? 'wss' : 'ws'

  if (port === '5173') {
    return `${wsProtocol}://${hostname}:8080/ws?${query}`
  }

  if (!port) {
    return `${wsProtocol}://${hostname}/ws?${query}`
  }

  return `${wsProtocol}://${hostname}:${port}/ws?${query}`
}

function describeCloseEvent(event: CloseEvent): string {
  if (!event) {
    return ''
  }

  if (event.reason) {
    return `${event.reason} (code: ${event.code})`
  }

  switch (event.code) {
    case 1000:
      return '正常に切断されました (code: 1000)'
    case 1001:
      return '相手側によって切断されました (code: 1001)'
    case 1006:
      return 'ネットワークまたはサーバーとの通信が途絶しました (code: 1006)'
    default:
      return `接続が終了しました (code: ${event.code})`
  }
}

export function useBroadcaster({ room, peerId }: UseBroadcasterOptions): UseBroadcasterResult {
  const [phase, setPhase] = useState<BroadcastPhase>('idle')
  const [status, setStatus] = useState('準備待ち')
  const [lastError, setLastError] = useState<string | null>(null)
  const [viewers, setViewers] = useState<ViewerSummary[]>([])
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const { notify } = useToast()

  const showError = useCallback(
    (message: string, err?: unknown) => {
      setLastError(message)
      const detail = err ? describeError(err) : undefined
      notify({ type: 'error', message, description: detail })
    },
    [notify],
  )

  const showWarning = useCallback(
    (message: string, detail?: string) => {
      notify({ type: 'warning', message, description: detail })
    },
    [notify],
  )

  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const connectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const unmountedRef = useRef(false)

  const resetViewers = useCallback(() => {
    logger.debug('reset viewers')
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
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      logger.debug('closing socket', socket.readyState)
      socket.close(1000, 'broadcast finished')
    }
    socketRef.current = null
  }, [])

  const stopTracks = useCallback(() => {
    const stream = streamRef.current
    if (!stream) {
      return
    }
    logger.debug('stopping local media tracks')
    stream.getTracks().forEach((track) => {
      track.stop()
    })
    streamRef.current = null
    setLocalStream(null)
  }, [])

  const stop = useCallback(() => {
    logger.debug('stop invoked')
    resetViewers()
    closeSocket()
    stopTracks()
    setPhase('idle')
    setStatus('配信を終了しました')
  }, [closeSocket, resetViewers, stopTracks])

  const updateViewerState = useCallback(
    (peer: string, connectionState?: RTCPeerConnectionState) => {
      logger.debug('viewer state update', peer, connectionState)
      setViewers((current) => {
        const others = current.filter((entry) => entry.peerId !== peer)
        if (!connectionState) {
          return others
        }
        return [...others, { peerId: peer, connectionState }]
      })
    },
    [],
  )

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logger.warn('Signaling socket is not open; skipping message', message)
      return
    }
    logger.debug('send message', message)
    socket.send(JSON.stringify(message))
  }, [])

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
      logger.debug('viewer removed', viewerId, reason)
      logger.info(`viewer ${viewerId} disconnected (${reason})`)
    },
    [updateViewerState],
  )

  const handleViewerAnswer = useCallback(
    async (viewerId: string, payload: unknown) => {
      logger.debug('viewer answer received', viewerId)
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
        logger.debug('remote description applied', viewerId)
      } catch (error) {
        logger.error('Failed to set remote description', error)
        showError('視聴者からの応答を適用できませんでした', error)
        removeViewer(viewerId, 'setRemoteDescription failed')
      }
    },
    [removeViewer, showError],
  )

  const handleViewerIce = useCallback(
    async (viewerId: string, payload: unknown) => {
      logger.debug('ice candidate received', viewerId, payload)
      const pc = connectionsRef.current.get(viewerId)
      if (!pc || !payload || typeof payload !== 'object') {
        return
      }

      const candidate = payload as RTCIceCandidateInit
      try {
        await pc.addIceCandidate(candidate)
        logger.debug('ice candidate applied', viewerId)
      } catch (error) {
        logger.error('Failed to add ICE candidate', error)
        showError('ICE candidate の適用に失敗しました', error)
      }
    },
    [showError],
  )

  const createPeerConnection = useCallback(
    (viewerId: string) => {
      if (!streamRef.current) {
        showError('ローカルメディアが利用できません')
        return null
      }

      let pc = connectionsRef.current.get(viewerId)
      if (pc) {
        return pc
      }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      connectionsRef.current.set(viewerId, pc)
      updateViewerState(viewerId, pc.connectionState)
      logger.debug('created peer connection', viewerId)

      streamRef.current.getTracks().forEach((track) => {
        pc?.addTrack(track, streamRef.current as MediaStream)
      })

      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          return
        }
        logger.debug('local ice candidate', viewerId, event.candidate)
        sendMessage({ type: 'ice', to: viewerId, payload: event.candidate })
      }

      pc.onconnectionstatechange = () => {
        if (!pc) {
          return
        }
        logger.debug('connection state change', viewerId, pc.connectionState)
        updateViewerState(viewerId, pc.connectionState)
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          removeViewer(viewerId, `connection state ${pc.connectionState}`)
        }
      }

      return pc
    },
    [removeViewer, sendMessage, showError, updateViewerState],
  )

  const handleViewerJoin = useCallback(
    async (viewerId: string) => {
      logger.debug('viewer join requested', viewerId)
      const pc = createPeerConnection(viewerId)
      if (!pc) {
        return
      }

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        })
        logger.debug('local offer', viewerId)
        await pc.setLocalDescription(offer)
        sendMessage({ type: 'offer', to: viewerId, payload: offer })
        setStatus('視聴者にオファーを送信しました')
      } catch (error) {
        logger.error('Failed to create offer', error)
        showError('オファー生成に失敗しました', error)
        removeViewer(viewerId, 'createOffer failed')
      }
    },
    [createPeerConnection, removeViewer, sendMessage, showError],
  )

  const handleMessage = useCallback(
    (raw: string) => {
      logger.debug('message received', raw)
      let message: SignalingMessage
      try {
        message = JSON.parse(raw) as SignalingMessage
      } catch (error) {
        logger.warn('Received malformed signaling payload', raw, error)
        return
      }

      const sender = message.from
      switch (message.type) {
        case 'viewer-ready':
        case 'viewer-join':
          logger.debug('viewer ready/join', sender)
          if (sender) {
            void handleViewerJoin(sender)
          }
          break
        case 'answer':
          logger.debug('answer message', sender)
          if (sender) {
            void handleViewerAnswer(sender, message.payload)
          }
          break
        case 'ice':
          logger.debug('ice message', sender)
          if (sender) {
            void handleViewerIce(sender, message.payload)
          }
          break
        case 'viewer-left':
        case 'bye':
          logger.debug('viewer left message', sender)
          if (sender) {
            removeViewer(sender, 'viewer requested disconnect')
          }
          break
        case 'error': {
          let description: string | null = null

          if (typeof (message as { message?: unknown }).message === 'string') {
            const directMessage = (message as { message?: string }).message
            if (directMessage && directMessage.length > 0) {
              description = directMessage
            }
          }

          if (!description && typeof message.payload === 'object' && message.payload) {
            const payload = message.payload as { message?: unknown }
            if (typeof payload.message === 'string' && payload.message.length > 0) {
              description = payload.message
            }
          }

          showError(description ?? 'シグナリングサーバからエラーを受信しました')
          break
        }
        default:
          logger.debug('unsupported message', message.type)
          logger.info('Received unsupported signaling message', message)
      }
    },
    [handleViewerAnswer, handleViewerIce, handleViewerJoin, removeViewer, showError],
  )

  const start = useCallback(async () => {
    if (phase !== 'idle') {
      logger.debug('start skipped, phase', phase)
      return
    }
    if (!room || room.trim().length === 0 || !peerId || peerId.trim().length === 0) {
      const message = 'ルームIDとピアIDを入力してください'
      logger.debug('start aborted due to missing identifiers', room, peerId)
      setLastError(message)
      showWarning(message)
      setStatus(message)
      setPhase('idle')
      return
    }

    setPhase('preparing-media')
    setStatus('カメラとマイクへのアクセスをリクエストしています...')
    setLastError(null)

    try {
      logger.debug('requesting media devices')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      setLocalStream(stream)
      const audioTrack = stream.getAudioTracks()[0]
      const videoTrack = stream.getVideoTracks()[0]
      setAudioEnabled(audioTrack ? audioTrack.enabled : false)
      setVideoEnabled(videoTrack ? videoTrack.enabled : false)
    } catch (error) {
      logger.error('Failed to acquire media devices', error)
      showError('カメラ・マイクの取得に失敗しました。ブラウザの権限設定を確認してください。', error)
      setPhase('idle')
      setStatus('メディアデバイスを利用できません')
      stopTracks()
      return
    }

    setPhase('connecting')
    setStatus('シグナリングサーバへ接続中...')

    const url = buildSignalingUrl(room, peerId)
    logger.debug('connecting to signaling server', url)
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      if (unmountedRef.current) {
        socket.close()
        return
      }
      logger.debug('socket opened')
      setPhase('ready')
      setStatus('接続しました。視聴者からの参加を待機しています。')
      sendMessage({ type: 'broadcaster-ready' })
    }

    socket.onmessage = (event) => {
      logger.debug('socket message', event.data)
      handleMessage(event.data)
    }

    socket.onerror = (event) => {
      logger.error('Signaling socket error', event)
      showError('シグナリング通信でエラーが発生しました', event)
    }

    socket.onclose = (event) => {
      logger.debug('socket closed', event.code, event.reason)
      if (unmountedRef.current) {
        return
      }
      resetViewers()
      socketRef.current = null

      if (event.code === 1000 && event.reason === 'broadcast finished') {
        setStatus('配信を終了しました')
      } else {
        const detail = describeCloseEvent(event)
        logger.warn('Signaling socket closed', event.code, event.reason)
        showWarning('シグナリング接続が切断されました', detail)
        setStatus('シグナリング接続が切断されました')
      }

      setPhase('idle')
    }
  }, [
    handleMessage,
    peerId,
    phase,
    room,
    resetViewers,
    sendMessage,
    showError,
    showWarning,
    stopTracks,
  ])

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
    unmountedRef.current = false
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
    [
      audioEnabled,
      lastError,
      localStream,
      phase,
      start,
      status,
      stop,
      toggleAudio,
      toggleVideo,
      videoEnabled,
      viewers,
    ],
  )
}
