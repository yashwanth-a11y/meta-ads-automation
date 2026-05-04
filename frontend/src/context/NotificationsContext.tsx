import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getAuthToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotificationType = 'pipeline_done' | 'pipeline_failed' | 'creative_generated'

export type AppNotification = {
  id: string
  type: NotificationType
  timestamp: string
  read: boolean
  // pipeline_done
  runId?: string
  ingested?: number
  classified?: number
  scored?: number
  // pipeline_failed
  error?: string
  // creative_generated
  bundle_id?: string
  content_type?: string
  title?: string
  message?: string
}

type NotificationsContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => void
  markRead: (id: string) => void
  clear: () => void
}

// ── Context ────────────────────────────────────────────────────────────────────

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
  clear: () => {},
})

export function useNotifications() {
  return useContext(NotificationsContext)
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const esRef = useRef<EventSource | null>(null)
  // keep a counter to give each notification a stable id
  const counterRef = useRef(0)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return

    const url = `${BASE_URL}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        // Skip the initial handshake ping
        if (payload.type === 'connected') return

        const notification: AppNotification = {
          id: `n-${++counterRef.current}`,
          read: false,
          ...payload,
        }

        setNotifications((prev) => [notification, ...prev].slice(0, 50))

        // Dispatch a window event so individual pages can react without prop drilling
        window.dispatchEvent(new CustomEvent('app:notification', { detail: notification }))
      } catch (_) { /* malformed event — ignore */ }
    }

    es.onerror = () => {
      // EventSource auto-reconnects after a backoff — nothing to do here
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }, [])

  const clear = useCallback(() => setNotifications([]), [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, clear }}>
      {children}
    </NotificationsContext.Provider>
  )
}
