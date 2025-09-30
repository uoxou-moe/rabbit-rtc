import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../notifications/ToastContext'
import { createLogger } from '../../lib/logger'
import { describeError } from '../../lib/errors'
import { describeCloseEvent } from '../../lib/websocket'
import { buildSignalingUrl } from '../broadcast/useBroadcaster'

const logger = createLogger('useViewer')

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

type ViewerPhase = 'idle' | 'connecting' | 'waiting-offer' | 'answering' | 'watching'

type SignalingMessage = {
  type: string
  from?: string
  to?: string
  payload?: unknown
  message?: unknown
}

interface UseViewerOptions {
  room: string
  peerId: string
}

interface UseViewerResult {
  remoteStream: MediaStream | null
  phase: ViewerPhase
  status: string
  lastError: string | null
  connectionState: RTCPeerConnectionState | null
  connect: () => void
  disconnect: () => void
}

export function useViewer({ room, peerId }: UseViewerOptions): UseViewerResult {
  const [phase, setPhase] = useState<ViewerPhase>('idle')
  const [status, setStatus] = useState('未接続')
  const [lastError, setLastError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const broadcasterRef = useRef<string | null>(null)
  const unmountedRef = useRef(false)

  const safeSetPhase = useCallback((value: ViewerPhase) => {
    if (unmountedRef.current) {
      return
    }
    setPhase(value)
  }, [])

  const safeSetStatus = useCallback((value: string) => {
    if (unmountedRef.current) {
      return
    }
    setStatus(value)
  }, [])

  const safeSetLastError = useCallback((value: string | null) => {
    if (unmountedRef.current) {
      return
    }
    setLastError(value)
  }, [])

  const safeSetConnectionState = useCallback((value: RTCPeerConnectionState | null) => {
    if (unmountedRef.current) {
      return
    }
    setConnectionState(value)
  }, [])

  const safeSetRemoteStream = useCallback((stream: MediaStream | null) => {
    if (unmountedRef.current) {
      return
    }
    setRemoteStream(stream)
  }, [])

  const { notify } = useToast()

  const reportError = useCallback(
    (message: string, err?: unknown) => {
      safeSetLastError(message)
      const detail = err ? describeError(err) : undefined
      notify({ type: 'error', message, description: detail })
    },
    [notify, safeSetLastError],
  )

  const reportWarning = useCallback(
    (message: string, detail?: string) => {
      notify({ type: 'warning', message, description: detail })
    },
    [notify],
  )

  const closeSocket = useCallback(() => {
    const socket = socketRef.current
    if (!socket) {
      return
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      logger.debug('closing socket')
      socket.close(1000, 'viewer disconnected')
    }

    socketRef.current = null
  }, [])

  const cleanupPeerConnection = useCallback(() => {
    const pc = peerConnectionRef.current
    if (pc) {
      logger.debug('cleaning up peer connection')
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      try {
        pc.close()
      } catch (error) {
        logger.debug('peer connection close error', error)
      }
    }

    peerConnectionRef.current = null
    broadcasterRef.current = null

    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (error) {
          logger.debug('failed to stop remote track', error)
        }
      })
    }

    streamRef.current = null
    safeSetRemoteStream(null)
    safeSetConnectionState(null)
  }, [safeSetConnectionState, safeSetRemoteStream])

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current
    const typeCandidate = (message as { type?: unknown }).type
    const messageType = typeof typeCandidate === 'string' ? typeCandidate : 'unknown'

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logger.debug('signaling socket is not open; skipping message', { type: messageType })
      return
    }

    try {
      socket.send(JSON.stringify(message))
      logger.debug('sent signaling message', { type: messageType })
    } catch (error) {
      logger.warn('Failed to send signaling message', error)
    }
  }, [])

  const requestOffer = useCallback(() => {
    logger.debug('requesting offer from broadcaster')
    sendMessage({ type: 'viewer-ready' })
  }, [sendMessage])

  const createPeerConnection = useCallback(() => {
    let pc = peerConnectionRef.current
    if (pc) {
      return pc
    }

    logger.debug('creating peer connection')
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerConnectionRef.current = pc

    pc.ontrack = (event) => {
      logger.debug('remote track received', event.streams)
      if (event.streams && event.streams[0]) {
        streamRef.current = event.streams[0]
        safeSetRemoteStream(event.streams[0])
      } else {
        let stream = streamRef.current
        if (!stream) {
          stream = new MediaStream()
          streamRef.current = stream
        }
        stream.addTrack(event.track)
        safeSetRemoteStream(stream)
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return
      }
      const broadcaster = broadcasterRef.current
      if (!broadcaster) {
        logger.debug('no broadcaster to send ice candidate')
        return
      }
      logger.debug('local ice candidate', event.candidate)
      sendMessage({ type: 'ice', to: broadcaster, payload: event.candidate })
    }

    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState ?? null
      logger.debug('connection state changed', state)
      if (state) {
        safeSetConnectionState(state)
      } else {
        safeSetConnectionState(null)
      }

      if (!state) {
        return
      }

      if (state === 'connected') {
        safeSetPhase('watching')
        safeSetStatus('配信を視聴しています')
      } else if (state === 'failed') {
        reportError('ピア接続が失敗しました')
        safeSetStatus('ピア接続が失敗しました')
        cleanupPeerConnection()
        safeSetPhase('waiting-offer')
        requestOffer()
      } else if (state === 'disconnected' || state === 'closed') {
        safeSetStatus('接続が終了しました。再開を待機しています...')
        cleanupPeerConnection()
        safeSetPhase('waiting-offer')
        requestOffer()
      }
    }

    return pc
  }, [
    cleanupPeerConnection,
    safeSetConnectionState,
    reportError,
    safeSetPhase,
    safeSetRemoteStream,
    safeSetStatus,
    sendMessage,
    requestOffer,
  ])

  const handleOffer = useCallback(
    async (sender: string, payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      const description = payload as RTCSessionDescriptionInit
      if (!description.sdp || description.type !== 'offer') {
        return
      }

      const pc = createPeerConnection()
      broadcasterRef.current = sender

      try {
        safeSetPhase('answering')
        safeSetStatus('オファーを処理しています...')
        await pc.setRemoteDescription(description)
        if (unmountedRef.current) {
          return
        }

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (unmountedRef.current) {
          return
        }

        sendMessage({ type: 'answer', to: sender, payload: answer })
        safeSetStatus('アンサーを送信しました。接続を確立しています...')
      } catch (error) {
        logger.error('Failed to handle offer', error)
        reportError('オファーの処理中にエラーが発生しました', error)
        safeSetStatus('オファーの処理に失敗しました')
        cleanupPeerConnection()
        safeSetPhase('waiting-offer')
      }
    },
    [
      cleanupPeerConnection,
      createPeerConnection,
      reportError,
      safeSetPhase,
      safeSetStatus,
      sendMessage,
    ],
  )

  const handleRemoteIce = useCallback(
    async (payload: unknown) => {
      const pc = peerConnectionRef.current
      if (!pc || !payload || typeof payload !== 'object') {
        return
      }

      try {
        await pc.addIceCandidate(payload as RTCIceCandidateInit)
      } catch (error) {
        logger.error('Failed to add remote ICE candidate', error)
        reportError('リモート ICE candidate の適用に失敗しました', error)
      }
    },
    [reportError],
  )

  const handleBroadcasterLeft = useCallback(() => {
    logger.debug('broadcaster left or ended')
    cleanupPeerConnection()
    safeSetStatus('配信が終了しました。再開を待機しています...')
    safeSetPhase('waiting-offer')
  }, [cleanupPeerConnection, safeSetPhase, safeSetStatus])

  const handleMessage = useCallback(
    (raw: string) => {
      let message: SignalingMessage
      try {
        message = JSON.parse(raw) as SignalingMessage
      } catch (error) {
        const fallbackInfo = typeof raw === 'string' ? { length: raw.length } : { length: 0 }
        logger.warn('Received malformed signaling payload', fallbackInfo, error)
        return
      }

      const messageType = typeof message.type === 'string' ? message.type : 'unknown'
      logger.debug('message received', { type: messageType })

      const sender = message.from
      switch (message.type) {
        case 'offer':
          if (sender) {
            void handleOffer(sender, message.payload)
          }
          break
        case 'ice':
          void handleRemoteIce(message.payload)
          break
        case 'broadcaster-ready':
          safeSetStatus('配信者がオンラインになりました。接続準備中...')
          requestOffer()
          break
        case 'bye':
        case 'broadcaster-left':
          handleBroadcasterLeft()
          break
        case 'error': {
          if (typeof message.message === 'string' && message.message.length > 0) {
            reportError(message.message)
            return
          }
          if (message.payload && typeof message.payload === 'object') {
            const payload = message.payload as { message?: unknown }
            if (typeof payload.message === 'string' && payload.message.length > 0) {
              reportError(payload.message)
              return
            }
          }
          reportError('シグナリングサーバからエラーを受信しました')
          break
        }
        default:
          logger.debug('unsupported message type', message.type)
      }
    },
    [handleBroadcasterLeft, handleOffer, handleRemoteIce, requestOffer, reportError, safeSetStatus],
  )

  const connect = useCallback(() => {
    if (phase !== 'idle') {
      logger.debug('connect skipped due to phase', phase)
      return
    }

    const trimmedRoom = room.trim()
    const trimmedPeer = peerId.trim()
    // TODO(#28): 同一ピアIDを利用する視聴者がソケット切断される問題を解消する。
    // https://github.com/uoxou-moe/rabbit-rtc/issues/28
    if (trimmedRoom.length === 0 || trimmedPeer.length === 0) {
      const message = 'ルームIDとピアIDを入力してください'
      safeSetLastError(message)
      reportWarning(message)
      safeSetStatus(message)
      return
    }

    safeSetPhase('connecting')
    safeSetStatus('シグナリングサーバへ接続中...')
    safeSetLastError(null)
    safeSetConnectionState(null)

    const url = buildSignalingUrl(trimmedRoom, trimmedPeer)
    logger.debug('connecting to signaling server', url)

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      logger.debug('socket opened')
      if (unmountedRef.current) {
        socket.close()
        return
      }
      safeSetPhase('waiting-offer')
      safeSetStatus('配信者からのオファーを待機しています...')
      requestOffer()
    }

    socket.onmessage = (event) => {
      handleMessage(event.data)
    }

    socket.onerror = (event) => {
      logger.error('Signaling socket error', event)
      reportError('シグナリング通信でエラーが発生しました', event)
    }

    socket.onclose = (event) => {
      logger.debug('socket closed', event.code, event.reason)
      cleanupPeerConnection()
      socketRef.current = null
      if (unmountedRef.current) {
        return
      }
      safeSetPhase('idle')
      if (event.code === 1000 && event.reason === 'viewer disconnected') {
        safeSetStatus('視聴を終了しました')
      } else {
        const detail = describeCloseEvent(event, {
          1001: '配信者が接続を終了しました (code: 1001)',
        })
        logger.warn('Signaling socket closed', event.code, event.reason)
        reportWarning('シグナリング接続が終了しました', detail)
        safeSetStatus('シグナリング接続が終了しました')
      }
    }
  }, [
    cleanupPeerConnection,
    handleMessage,
    phase,
    peerId,
    reportError,
    reportWarning,
    requestOffer,
    room,
    safeSetConnectionState,
    safeSetLastError,
    safeSetPhase,
    safeSetStatus,
  ])

  const disconnect = useCallback(() => {
    logger.debug('disconnect invoked')
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendMessage({ type: 'viewer-left' })
    }
    cleanupPeerConnection()
    closeSocket()
    safeSetPhase('idle')
    safeSetStatus('視聴を終了しました')
  }, [cleanupPeerConnection, closeSocket, safeSetPhase, safeSetStatus, sendMessage])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      disconnect()
    }
  }, [disconnect])

  return useMemo(
    () => ({
      remoteStream,
      phase,
      status,
      lastError,
      connectionState,
      connect,
      disconnect,
    }),
    [connect, connectionState, disconnect, lastError, phase, remoteStream, status],
  )
}
