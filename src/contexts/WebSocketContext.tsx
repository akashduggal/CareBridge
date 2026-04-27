import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { getIdToken } from 'firebase/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { calculateReconnectDelay } from '@/utils/websocketUtils'
import { queryKeys } from '@/lib/queryKeys'
import { auth } from '@/lib/firebase'
import { mockEventEmitter } from '@/mocks/mockEventEmitter'
import type {
  ApiResponse,
  CallCompletedEvent,
  CallStartedEvent,
  DashboardStats,
  Discharge,
  DischargeCreatedEvent,
  Escalation,
  EscalationTriggeredEvent,
  WebSocketContextValue,
  WebSocketEvent,
} from '@/types'

const MAX_RECONNECT_ATTEMPTS = 5
const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000'

/** Returns true when the current URL contains `?demo=true`. */
function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('demo') === 'true'
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isWebSocketEvent(data: unknown): data is WebSocketEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'id' in data &&
    typeof (data as Record<string, unknown>).type === 'string' &&
    typeof (data as Record<string, unknown>).id === 'string'
  )
}

function isCallCompletedEvent(e: WebSocketEvent): e is CallCompletedEvent {
  return e.type === 'call_completed'
}

function isDischargeCreatedEvent(e: WebSocketEvent): e is DischargeCreatedEvent {
  return e.type === 'discharge_created'
}

function isCallStartedEvent(e: WebSocketEvent): e is CallStartedEvent {
  return e.type === 'call_started'
}

function isEscalationTriggeredEvent(e: WebSocketEvent): e is EscalationTriggeredEvent {
  return e.type === 'escalation_triggered'
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()

  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const [lastDischargeCreatedId, setLastDischargeCreatedId] = useState<string | null>(null)

  // In-memory deduplication cache — cleared on sign-out
  const processedEventIds = useRef<Set<string>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const isUnmountedRef = useRef(false)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const handleEvent = useCallback(
    (event: WebSocketEvent) => {
      // Deduplication — skip already-processed events
      if (processedEventIds.current.has(event.id)) return
      processedEventIds.current.add(event.id)
      setLastEventId(event.id)

      if (isCallCompletedEvent(event)) {
        // Update call record in cache
        queryClient.setQueryData(queryKeys.calls(event.callId), (old: unknown) => {
          if (!old) return old
          const response = old as ApiResponse<Record<string, unknown>>
          return {
            ...response,
            data: {
              ...response.data,
              outcome: event.outcome,
              riskScore: event.riskScore,
              confidence: event.confidence,
              riskTier: event.riskTier,
            },
          }
        })
        // Update dashboard stats: decrement pendingCalls (never below 0),
        // increment the appropriate tier, and increment completedToday
        queryClient.setQueryData(queryKeys.dashboard(), (old: unknown) => {
          if (!old) return old
          const stats = old as DashboardStats
          const tierKey = `tier${event.riskTier}` as 'tier1' | 'tier2' | 'tier3'
          return {
            ...stats,
            pendingCalls: Math.max(0, stats.pendingCalls - 1),
            completedToday: stats.completedToday + 1,
            tierDistribution: {
              ...stats.tierDistribution,
              [tierKey]: stats.tierDistribution[tierKey] + 1,
            },
          }
        })
        // Invalidate discharges to refresh pending calls count
        void queryClient.invalidateQueries({ queryKey: ['discharges'] })
      } else if (isDischargeCreatedEvent(event)) {
        // Prepend to page-1 discharges cache
        queryClient.setQueryData(queryKeys.discharges({ page: 1 }), (old: unknown) => {
          if (!old) return old
          const response = old as ApiResponse<Discharge[]>
          return {
            ...response,
            data: [event.discharge, ...response.data],
          }
        })
        // Notify page about the new discharge (for non-page-1 banner)
        setLastDischargeCreatedId(event.id)
        // Increment today's discharges count in dashboard stats cache
        queryClient.setQueryData(queryKeys.dashboard(), (old: unknown) => {
          if (!old) return old
          const stats = old as DashboardStats
          return {
            ...stats,
            todayDischarges: stats.todayDischarges + 1,
          }
        })
      } else if (isCallStartedEvent(event)) {
        // Update discharge callStatus across all discharges cache entries
        queryClient.setQueriesData({ queryKey: ['discharges'] }, (old: unknown) => {
          if (!old) return old
          const response = old as ApiResponse<Discharge[]>
          return {
            ...response,
            data: response.data.map((d) =>
              d.id === event.dischargeId ? { ...d, callStatus: 'in_progress' as const } : d
            ),
          }
        })
      } else if (isEscalationTriggeredEvent(event)) {
        // Append to escalations cache
        queryClient.setQueryData(queryKeys.escalations(), (old: unknown) => {
          if (!old) return old
          const response = old as ApiResponse<Escalation[]>
          return {
            ...response,
            data: [...response.data, event.escalation],
          }
        })
        // Increment active escalations count in dashboard stats cache (never below 0)
        queryClient.setQueryData(queryKeys.dashboard(), (old: unknown) => {
          if (!old) return old
          const stats = old as DashboardStats
          return {
            ...stats,
            activeEscalations: Math.max(0, stats.activeEscalations + 1),
          }
        })
      } else {
        // Unrecognized event type — log without throwing
        console.warn(
          '[WebSocket] Unrecognized event type:',
          (event as Record<string, unknown>).type
        )
      }
    },
    [queryClient]
  )

  const connect = useCallback(async () => {
    if (isUnmountedRef.current) return
    closeSocket()

    try {
      const token = await getIdToken(auth.currentUser!, true)
      if (isUnmountedRef.current) return

      const ws = new WebSocket(`${WS_BASE_URL}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (isUnmountedRef.current) return
        setConnected(true)
        setReconnecting(false)
        setConnectionAttempts(0)
        attemptRef.current = 0
        // Invalidate all active queries to reconcile any missed updates
        void queryClient.invalidateQueries()
      }

      ws.onmessage = (messageEvent: MessageEvent) => {
        try {
          const data: unknown = JSON.parse(messageEvent.data as string)
          if (isWebSocketEvent(data)) {
            handleEvent(data)
          } else {
            console.warn('[WebSocket] Received non-event message:', data)
          }
        } catch {
          console.warn('[WebSocket] Failed to parse message:', messageEvent.data)
        }
      }

      ws.onerror = () => {
        // onclose fires after onerror — reconnection handled there
      }

      ws.onclose = () => {
        if (isUnmountedRef.current) return
        setConnected(false)
        wsRef.current = null

        const nextAttempt = attemptRef.current
        if (nextAttempt >= MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(false)
          setConnectionAttempts(nextAttempt)
          return
        }

        setReconnecting(true)
        setConnectionAttempts(nextAttempt + 1)
        attemptRef.current = nextAttempt + 1

        const delay = calculateReconnectDelay(nextAttempt)
        reconnectTimerRef.current = setTimeout(() => {
          void connect()
        }, delay)
      }
    } catch {
      if (isUnmountedRef.current) return
      const nextAttempt = attemptRef.current
      if (nextAttempt >= MAX_RECONNECT_ATTEMPTS) {
        setReconnecting(false)
        setConnectionAttempts(nextAttempt)
        return
      }
      setReconnecting(true)
      setConnectionAttempts(nextAttempt + 1)
      attemptRef.current = nextAttempt + 1
      const delay = calculateReconnectDelay(nextAttempt)
      reconnectTimerRef.current = setTimeout(() => {
        void connect()
      }, delay)
    }
  }, [closeSocket, handleEvent, queryClient])

  // Reset unmount flag on mount
  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  // Connect when auth resolves with a valid user; disconnect on sign-out
  useEffect(() => {
    if (loading) return // Wait for auth to resolve (task 7.1)

    if (!user) {
      // User signed out — clear deduplication cache and close socket
      processedEventIds.current.clear()
      clearReconnectTimer()
      closeSocket()
      setConnected(false)
      setReconnecting(false)
      attemptRef.current = 0
      setConnectionAttempts(0)
      return
    }

    // Demo Mode (task 17.6): skip the real WebSocket and subscribe to the
    // local mock emitter instead. No outbound network connection is made.
    if (isDemoMode()) {
      setConnected(true)
      setReconnecting(false)
      mockEventEmitter.on(handleEvent)
      return () => {
        mockEventEmitter.off(handleEvent)
        setConnected(false)
      }
    }

    // Auth resolved with valid user — connect (task 7.2)
    void connect()

    return () => {
      clearReconnectTimer()
      closeSocket()
    }
  }, [user, loading, connect, clearReconnectTimer, closeSocket, handleEvent])

  return (
    <WebSocketContext.Provider value={{ connected, reconnecting, connectionAttempts, lastEventId, lastDischargeCreatedId }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider')
  return ctx
}
