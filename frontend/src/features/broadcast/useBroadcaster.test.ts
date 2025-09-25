import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSignalingUrl } from './useBroadcaster'

const originalLocation = window.location

afterEach(() => {
  vi.unstubAllEnvs()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
})

describe('buildSignalingUrl', () => {
  it('appends query parameters to custom signaling base url', () => {
    vi.stubEnv('VITE_SIGNALING_WS_URL', 'ws://example.com/ws')

    const result = buildSignalingUrl('room', 'peer')

    expect(result).toBe('ws://example.com/ws?room=room&peer=peer')
  })

  it('uses ampersand when custom url already contains query parameters', () => {
    vi.stubEnv('VITE_SIGNALING_WS_URL', 'ws://example.com/ws?token=abc')

    const result = buildSignalingUrl('room', 'peer')

    expect(result).toBe('ws://example.com/ws?token=abc&room=room&peer=peer')
  })

  it('falls back to backend port 8080 when running on Vite dev server', () => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        protocol: 'http:',
        hostname: 'localhost',
        port: '5173',
      } as unknown as Location,
    })

    const result = buildSignalingUrl('demo-room', 'broadcaster-1234')

    expect(result).toBe('ws://localhost:8080/ws?room=demo-room&peer=broadcaster-1234')
  })

  it('uses secure websocket and omits default port for https origins', () => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        protocol: 'https:',
        hostname: 'stream.example',
        port: '',
      } as unknown as Location,
    })

    const result = buildSignalingUrl('room', 'peer')

    expect(result).toBe('wss://stream.example/ws?room=room&peer=peer')
  })
})
