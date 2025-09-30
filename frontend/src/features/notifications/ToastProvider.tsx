import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './ToastProvider.css'
import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
  type ToastKind,
} from './ToastContext'

type ToastEntry = Required<Pick<ToastInput, 'message'>> & {
  id: string
  type: ToastKind
  description?: string
  duration: number | null
}

const DEFAULT_DURATION = 5000
const ERROR_DURATION = 8000

function generateId() {
  return `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function normalizeToast(input: ToastInput): ToastEntry {
  const type = input.type ?? 'info'
  const duration =
    input.duration === undefined
      ? type === 'error'
        ? ERROR_DURATION
        : DEFAULT_DURATION
      : input.duration

  return {
    id: input.id ?? generateId(),
    type,
    message: input.message,
    description: input.description,
    duration: duration === null || duration <= 0 ? null : duration,
  }
}

function useToastTimers() {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timersMap = timers.current
    return () => {
      timersMap.forEach((timer) => {
        clearTimeout(timer)
      })
      timersMap.clear()
    }
  }, [])

  const setTimer = useCallback((id: string, duration: number | null, cleanup: () => void) => {
    if (duration === null) {
      return
    }

    const timer = window.setTimeout(() => {
      timers.current.delete(id)
      cleanup()
    }, duration)

    timers.current.set(id, timer)
  }, [])

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  return { setTimer, clearTimer }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const { setTimer, clearTimer } = useToastTimers()

  const dismiss = useCallback(
    (id: string) => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      clearTimer(id)
    },
    [clearTimer],
  )

  const notify = useCallback(
    (input: ToastInput) => {
      const toast = normalizeToast(input)
      setToasts((current) => {
        const others = current.filter((existing) => existing.id !== toast.id)
        return [...others, toast]
      })

      if (toast.duration !== null) {
        clearTimer(toast.id)
        setTimer(toast.id, toast.duration, () => {
          setToasts((current) => current.filter((item) => item.id !== toast.id))
        })
      }

      return toast.id
    },
    [clearTimer, setTimer],
  )

  const contextValue = useMemo<ToastContextValue>(() => ({ notify, dismiss }), [dismiss, notify])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

type ToastViewportProps = {
  toasts: ToastEntry[]
  onDismiss: (id: string) => void
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="toast-container" aria-live="assertive">
      {toasts.map((toast) => {
        const role = toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={role}>
            <div className="toast-body">
              <p className="toast-message">{toast.message}</p>
              {toast.description ? <p className="toast-description">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="閉じる"
              onClick={() => onDismiss(toast.id)}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
