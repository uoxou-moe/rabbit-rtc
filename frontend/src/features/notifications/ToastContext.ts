import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export type ToastInput = {
  id?: string
  type?: ToastKind
  message: string
  description?: string
  duration?: number
}

export type ToastContextValue = {
  notify: (toast: ToastInput) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
