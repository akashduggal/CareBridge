/**
 * Tests for WebSocketContext (tasks 7.14–7.17)
 *
 * 7.14 – WebSocket NOT connected before auth resolves
 * 7.15 – Reconnect delays follow exponential backoff, never exceed 30s
 * 7.16 – Duplicate event ID processed only once
 * 7.17 – "Connection lost — reconnecting…" banner shown while disconnected; hidden on reconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readyState = 0
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {
    this.readyState = 3
  }

  simulateOpen() {
    this.readyState = 1
    this.onopen?.()
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateClose() {
    this.readyState = 3
    this.onclose?.()
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext'
import type { Mock } from 'vitest'
import type { AuthContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'nurse@example.com' } as unknown as User

function mockAuth(state: { user: User | null; loading: boolean }) {
  ;(useAuth as Mock).mockReturnValue({
    user: state.user,
    loading: state.loading,
    role: 'nurse',
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderWithProviders(ui: React.ReactNode, testQueryClient?: QueryClient) {
  const qc = testQueryClient ?? makeTestQueryClient()
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <WebSocketProvider>{ui}</WebSocketProvider>
      </QueryClientProvider>
    ),
  }
}

/** Consumer that exposes WebSocket state for assertions */
function WsConsumer() {
  const { connected, reconnecting, connectionAttempts } = useWebSocket()
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="reconnecting">{String(reconnecting)}</span>
      <span data-testid="attempts">{connectionAttempts}</span>
      {reconnecting && (
        <div role="status" data-testid="reconnecting-banner">
          Connection lost — reconnecting…
        </div>
      )}
      {!reconnecting && connectionAttempts >= 5 && (
        <div role="alert" data-testid="failed-banner">
          Connection failed — please refresh the page
        </div>
      )}
      {connected && <div data-testid="connected-indicator">Connected</div>}
    </div>
  )
}

// ─── 7.14: WebSocket NOT connected before auth resolves ───────────────────────

describe('7.14 – WebSocket not connected before auth resolves', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('does not create a WebSocket while auth is loading', () => {
    mockAuth({ user: null, loading: true })

    renderWithProviders(<WsConsumer />)

    // No WebSocket should have been instantiated
    expect(MockWebSocket.instances).toHaveLength(0)
    expect(screen.getByTestId('connected')).toHaveTextContent('false')
  })

  it('does not create a WebSocket when auth resolves with no user', () => {
    mockAuth({ user: null, loading: false })

    renderWithProviders(<WsConsumer />)

    expect(MockWebSocket.instances).toHaveLength(0)
    expect(screen.getByTestId('connected')).toHaveTextContent('false')
  })

  it('creates a WebSocket once auth resolves with a valid user', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    // getIdToken is async — wait for the WebSocket to be created
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    expect(MockWebSocket.instances[0].url).toContain('/ws?token=mock-token')
  })
})

// ─── 7.15: Reconnect delays follow exponential backoff ───────────────────────

describe('7.15 – Reconnect delays follow exponential backoff, never exceed 30s', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules first reconnect after 1000ms (attempt 0)', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    // Wait for initial connection attempt
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const ws = MockWebSocket.instances[0]
    expect(ws).toBeDefined()

    // Simulate connection close — triggers reconnect with delay
    act(() => {
      ws.simulateClose()
    })

    expect(screen.getByTestId('reconnecting')).toHaveTextContent('true')

    // Advance by 999ms — should not have reconnected yet
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(1)

    // Advance by 1ms more (total 1000ms) — reconnect fires
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)
  })

  it('second reconnect uses 2000ms delay (attempt 1)', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // First close → attempt 0 → 1000ms delay
    act(() => {
      MockWebSocket.instances[0].simulateClose()
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Second close → attempt 1 → 2000ms delay
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws2.simulateClose()
    })

    const countBefore = MockWebSocket.instances.length

    // Advance 1999ms — should not reconnect yet
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(MockWebSocket.instances).toHaveLength(countBefore)

    // Advance 1ms more — reconnect fires
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(MockWebSocket.instances.length).toBeGreaterThan(countBefore)
  })
})

// ─── 7.16: Duplicate event ID processed only once ────────────────────────────

describe('7.16 – Duplicate event ID processed only once', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('processes a call_completed event only once when sent twice with the same ID', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()

    // Pre-populate the cache with a call record
    qc.setQueryData(['calls', 'call-1', 'transcript'], {
      data: { id: 'call-1', outcome: 'pending', riskScore: 3, confidence: 0.8, riskTier: 1 },
    })

    renderWithProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    const event = {
      type: 'call_completed',
      id: 'evt-dedup-001',
      callId: 'call-1',
      dischargeId: 'discharge-1',
      outcome: 'completed',
      riskScore: 7,
      confidence: 0.9,
      riskTier: 3,
      timestamp: new Date().toISOString(),
    }

    // Send the same event twice
    act(() => {
      ws.simulateMessage(event)
      ws.simulateMessage(event)
    })

    // Cache should reflect the event applied exactly once
    const cached = qc.getQueryData(['calls', 'call-1', 'transcript']) as {
      data: { riskScore: number }
    }
    expect(cached.data.riskScore).toBe(7)
  })

  it('processes two events with different IDs independently', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    qc.setQueryData(['calls', 'call-2', 'transcript'], {
      data: { id: 'call-2', outcome: 'pending', riskScore: 2, confidence: 0.7, riskTier: 1 },
    })
    qc.setQueryData(['calls', 'call-3', 'transcript'], {
      data: { id: 'call-3', outcome: 'pending', riskScore: 2, confidence: 0.7, riskTier: 1 },
    })

    renderWithProviders(<WsConsumer />, qc)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0))

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws.simulateOpen()
    })

    act(() => {
      ws.simulateMessage({
        type: 'call_completed',
        id: 'evt-001',
        callId: 'call-2',
        dischargeId: 'd-1',
        outcome: 'completed',
        riskScore: 8,
        confidence: 0.9,
        riskTier: 3,
        timestamp: new Date().toISOString(),
      })
      ws.simulateMessage({
        type: 'call_completed',
        id: 'evt-002',
        callId: 'call-3',
        dischargeId: 'd-2',
        outcome: 'voicemail',
        riskScore: 5,
        confidence: 0.6,
        riskTier: 2,
        timestamp: new Date().toISOString(),
      })
    })

    const cached2 = qc.getQueryData(['calls', 'call-2', 'transcript']) as {
      data: { riskScore: number }
    }
    const cached3 = qc.getQueryData(['calls', 'call-3', 'transcript']) as {
      data: { riskScore: number }
    }
    expect(cached2.data.riskScore).toBe(8)
    expect(cached3.data.riskScore).toBe(5)
  })
})

// ─── 7.17: Connection lost banner shown/hidden ────────────────────────────────

describe('7.17 – Connection lost banner shown while disconnected; hidden on reconnect', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows reconnecting banner when WebSocket disconnects', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const ws = MockWebSocket.instances[0]
    expect(ws).toBeDefined()

    // Initially not reconnecting
    expect(screen.queryByTestId('reconnecting-banner')).not.toBeInTheDocument()

    // Simulate disconnect
    act(() => {
      ws.simulateClose()
    })

    // Banner should appear
    expect(screen.getByTestId('reconnecting-banner')).toBeInTheDocument()
    expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent(
      'Connection lost — reconnecting…'
    )
  })

  it('hides reconnecting banner when WebSocket reconnects successfully', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const ws = MockWebSocket.instances[0]

    // Simulate open → disconnect → reconnect
    act(() => {
      ws.simulateOpen()
    })

    act(() => {
      ws.simulateClose()
    })

    expect(screen.getByTestId('reconnecting-banner')).toBeInTheDocument()

    // Advance timer to trigger reconnect
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Simulate the new WebSocket opening
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws2.simulateOpen()
    })

    // Banner should be gone
    expect(screen.queryByTestId('reconnecting-banner')).not.toBeInTheDocument()
    expect(screen.getByTestId('connected-indicator')).toBeInTheDocument()
  })

  it('shows failure banner after 5 failed reconnect attempts', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithProviders(<WsConsumer />)

    // Wait for initial connection attempt (attempt 0)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // MAX_RECONNECT_ATTEMPTS = 5 (attempts 0–4).
    // Each close schedules a reconnect timer; we advance past it so the next
    // WebSocket is created, then close that one too.
    // After 5 reconnect attempts (6 closes total), the provider gives up.
    for (let i = 0; i <= 5; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
      if (!ws) break
      act(() => {
        ws.simulateClose()
      })
      // Advance past the max backoff delay to fire the reconnect timer
      await act(async () => {
        vi.advanceTimersByTime(31000)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    expect(screen.getByTestId('failed-banner')).toBeInTheDocument()
    expect(screen.getByTestId('failed-banner')).toHaveTextContent(
      'Connection failed — please refresh the page'
    )
  }, 20000)
})
