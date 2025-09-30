const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const

export type LogLevel = keyof typeof LEVEL_PRIORITY

function parseLevel(input: string | undefined): LogLevel {
  switch (input?.toLowerCase()) {
    case 'debug':
      return 'debug'
    case 'warn':
      return 'warn'
    case 'error':
      return 'error'
    case 'info':
    default:
      return 'info'
  }
}

const globalLevel: LogLevel = parseLevel(
  import.meta.env.VITE_LOG_LEVEL ?? (import.meta.env.DEV ? 'debug' : 'info'),
)

function shouldLog(level: LogLevel) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[globalLevel]
}

function prefix(scope: string) {
  return scope ? `[${scope}]` : ''
}

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(scope: string): Logger {
  const tag = prefix(scope)

  return {
    debug: (...args: unknown[]) => {
      if (!shouldLog('debug')) {
        return
      }
      const entries = tag ? [tag, ...args] : args
      console.debug(...entries)
    },
    info: (...args: unknown[]) => {
      if (!shouldLog('info')) {
        return
      }
      const entries = tag ? [tag, ...args] : args
      console.info(...entries)
    },
    warn: (...args: unknown[]) => {
      if (!shouldLog('warn')) {
        return
      }
      const entries = tag ? [tag, ...args] : args
      console.warn(...entries)
    },
    error: (...args: unknown[]) => {
      // error は常に記録する
      const entries = tag ? [tag, ...args] : args
      console.error(...entries)
    },
  }
}
