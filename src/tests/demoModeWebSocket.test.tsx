/**
 * Tests for Task 17.6 — Demo Mode WebSocket isolation
 *
 * Verifies:
 *   - In demo mode (?demo=true), no real WebSocket connection is attempted
 *   - The mock event emitter is subscribed to instead
 *   - Events fired through the mock emitter update the TanStack Query cache
 *     via the same handleEvent pipeline as real WebSocket events
 *   - On unmount / sign-out, the mock emitter subscription is cleaned up
 *
 * Requirements 8.11, 8.12 (Demo Mode network isolation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
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
import { mockEventEmitter } from '@/mocks/mockEventEmitter'
import { DemoPanel } from '@/components/DemoPanel'
import { queryKeys } from '@/lib/queryKeys'
import type { Mock } from 'vitest'
import type { AuthContextValue, WebSocketEvent, DashboardStats, ApiResponse, Escalation } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'demo@example.com' } as unknown as User

function mockAuth(state: { user: User | null; loading: boolean }) {
  ;(useAuth as Mock).mockReturnValue({
    user: state.user,
    loading: state.loading,
    role: 'admin',
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function makeTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** Consumer that exposes WebSocket state for assertions */
function WsConsumer() {
  const { connected, reconnecting } = useWebSocket()
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="reconnecting">{String(reconnecting)}</span>
    </div>
  )
}

/**
 * Render WebSocketProvider inside a MemoryRouter so window.location.search
 * reflects the given path (including query params).
 */
function renderWithDemoMode(
  ui: React.ReactNode,
  initialPath: string,
  testQueryClient?: QueryClient
) {
  const qc = testQueryClient ?? makeTestQueryClient()
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <WebSocketProvider>{ui}</WebSocketProvider>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('17.6 – Demo Mode: no real WebSocket connection', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    // Simulate ?demo=true in the URL for window.location.search
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?demo=true' },
      writable: true,
    })
  })

  afterEach(() => {
    // Reset location search
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
    mockEventEmitter.clear()
  })

  it('does NOT create a real WebSocket when ?demo=true is active', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true')

    // Give async effects time to run
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // No real WebSocket should have been instantiated
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('reports connected=true in demo mode without a real WebSocket', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('connected')).toHaveTextContent('true')
    expect(screen.getByTestId('reconnecting')).toHaveTextContent('false')
  })

  it('subscribes to the mock emitter when demo mode is active', async () => {
    mockAuth({ user: fakeUser, loading: false })

    expect(mockEventEmitter.listenerCount).toBe(0)

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // WebSocketProvider should have registered a handler on the mock emitter
    expect(mockEventEmitter.listenerCount).toBe(1)
  })

  it('unsubscribes from the mock emitter on unmount', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const { unmount } = renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockEventEmitter.listenerCount).toBe(1)

    unmount()

    expect(mockEventEmitter.listenerCount).toBe(0)
  })
})

describe('17.6 – Demo Mode: mock emitter events update TanStack Query cache', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?demo=true' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
    mockEventEmitter.clear()
  })

  it('processes a call_completed event emitted via mockEventEmitter', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()

    // Pre-populate the cache with a call record
    qc.setQueryData(queryKeys.calls('demo-call-001'), {
      id: 'demo-call-001',
      outcome: 'pending',
      riskScore: 2,
      confidence: 0.9,
      riskTier: 1,
    })

    // Pre-populate dashboard stats
    const initialStats: DashboardStats = {
      todayDischarges: 4,
      pendingCalls: 3,
      activeEscalations: 0,
      tierDistribution: { tier1: 1, tier2: 1, tier3: 0 },
      dailyVolume: [],
      completedToday: 2,
    }
    qc.setQueryData(queryKeys.dashboard(), initialStats)

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true', qc)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const event: WebSocketEvent = {
      type: 'call_completed',
      id: 'demo-evt-001',
      callId: 'demo-call-001',
      dischargeId: 'demo-discharge-001',
      outcome: 'completed',
      riskScore: 7,
      confidence: 0.85,
      riskTier: 3,
      timestamp: new Date().toISOString(),
    }

    act(() => {
      mockEventEmitter.emit(event)
    })

    // Dashboard stats should be updated: pendingCalls decremented, tier3 incremented
    const updatedStats = qc.getQueryData(queryKeys.dashboard()) as DashboardStats
    expect(updatedStats.pendingCalls).toBe(2)
    expect(updatedStats.tierDistribution.tier3).toBe(1)
    expect(updatedStats.completedToday).toBe(3)
  })

  it('processes an escalation_triggered event emitted via mockEventEmitter', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()

    // Pre-populate escalations cache
    const initialEscalations: ApiResponse<Escalation[]> = {
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    }
    qc.setQueryData(queryKeys.escalations(), initialEscalations)

    // Pre-populate dashboard stats
    const initialStats: DashboardStats = {
      todayDischarges: 4,
      pendingCalls: 2,
      activeEscalations: 0,
      tierDistribution: { tier1: 2, tier2: 1, tier3: 0 },
      dailyVolume: [],
      completedToday: 3,
    }
    qc.setQueryData(queryKeys.dashboard(), initialStats)

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true', qc)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const escalation: Escalation = {
      id: 'demo-esc-001',
      dischargeId: 'demo-discharge-001',
      patientName: 'James Okafor',
      diagnosisGroup: 'AMI',
      dischargeDateTime: new Date().toISOString(),
      riskScore: 9,
      riskTier: 3,
      confidence: 0.85,
      callId: 'demo-call-001',
      createdAt: new Date().toISOString(),
    }

    const event: WebSocketEvent = {
      type: 'escalation_triggered',
      id: 'demo-evt-esc-001',
      escalation,
      timestamp: new Date().toISOString(),
    }

    act(() => {
      mockEventEmitter.emit(event)
    })

    // Escalations cache should have the new escalation appended
    const updatedEscalations = qc.getQueryData(queryKeys.escalations()) as ApiResponse<Escalation[]>
    expect(updatedEscalations.data).toHaveLength(1)
    expect(updatedEscalations.data[0].id).toBe('demo-esc-001')

    // Dashboard stats: activeEscalations incremented
    const updatedStats = qc.getQueryData(queryKeys.dashboard()) as DashboardStats
    expect(updatedStats.activeEscalations).toBe(1)
  })

  it('deduplicates events by ID in demo mode just like real WebSocket events', async () => {
    mockAuth({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()

    const initialStats: DashboardStats = {
      todayDischarges: 4,
      pendingCalls: 3,
      activeEscalations: 0,
      tierDistribution: { tier1: 1, tier2: 1, tier3: 0 },
      dailyVolume: [],
      completedToday: 2,
    }
    qc.setQueryData(queryKeys.dashboard(), initialStats)

    renderWithDemoMode(<WsConsumer />, '/dashboard?demo=true', qc)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const event: WebSocketEvent = {
      type: 'call_completed',
      id: 'demo-evt-dedup-001',
      callId: 'demo-call-x',
      dischargeId: 'demo-discharge-x',
      outcome: 'completed',
      riskScore: 5,
      confidence: 0.8,
      riskTier: 2,
      timestamp: new Date().toISOString(),
    }

    // Emit the same event twice
    act(() => {
      mockEventEmitter.emit(event)
      mockEventEmitter.emit(event)
    })

    // pendingCalls should only be decremented once (from 3 to 2, not to 1)
    const updatedStats = qc.getQueryData(queryKeys.dashboard()) as DashboardStats
    expect(updatedStats.pendingCalls).toBe(2)
    expect(updatedStats.completedToday).toBe(3)
  })
})

describe('17.6 – Non-demo mode: real WebSocket still connects', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    // Ensure no ?demo=true in URL
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    mockEventEmitter.clear()
  })

  it('creates a real WebSocket when ?demo=true is NOT in the URL', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithDemoMode(<WsConsumer />, '/dashboard')

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    expect(MockWebSocket.instances[0].url).toContain('/ws?token=mock-token')
  })

  it('does NOT subscribe to the mock emitter in non-demo mode', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderWithDemoMode(<WsConsumer />, '/dashboard')

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    // Mock emitter should have no listeners in non-demo mode
    expect(mockEventEmitter.listenerCount).toBe(0)
  })
})

describe('17.6 – DemoPanel fires scenario events through mock emitter', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?demo=true' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
    mockEventEmitter.clear()
  })

  it('clicking "Emergency Chest Pain" fires an escalation_triggered event through the mock emitter', async () => {
    ;(useAuth as Mock).mockReturnValue({
      user: fakeUser,
      loading: false,
      role: 'admin',
      authError: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshToken: vi.fn(),
    } satisfies AuthContextValue)

    const user = userEvent.setup()
    const qc = makeTestQueryClient()

    // Pre-populate escalations cache so the handler can append to it
    const initialEscalations: ApiResponse<Escalation[]> = {
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    }
    qc.setQueryData(queryKeys.escalations(), initialEscalations)

    // Pre-populate dashboard stats
    const initialStats: DashboardStats = {
      todayDischarges: 7,
      pendingCalls: 4,
      activeEscalations: 1,
      tierDistribution: { tier1: 2, tier2: 2, tier3: 2 },
      dailyVolume: [],
      completedToday: 6,
    }
    qc.setQueryData(queryKeys.dashboard(), initialStats)

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <WebSocketProvider>
            <WsConsumer />
            <DemoPanel />
          </WebSocketProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Wait for WebSocketProvider to subscribe to mock emitter
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Click the Emergency Chest Pain scenario
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    // The escalation_triggered event should have been processed by WebSocketProvider
    const updatedEscalations = qc.getQueryData(queryKeys.escalations()) as ApiResponse<Escalation[]>
    // The emergency scenario fires an escalation_triggered event
    expect(updatedEscalations.data.length).toBeGreaterThan(0)
    expect(updatedEscalations.data[0].riskTier).toBe(3)
  })

  it('clicking "Happy Path CHF" fires a call_completed event through the mock emitter', async () => {
    ;(useAuth as Mock).mockReturnValue({
      user: fakeUser,
      loading: false,
      role: 'admin',
      authError: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshToken: vi.fn(),
    } satisfies AuthContextValue)

    const user = userEvent.setup()
    const qc = makeTestQueryClient()

    // Pre-populate dashboard stats
    const initialStats: DashboardStats = {
      todayDischarges: 4,
      pendingCalls: 3,
      activeEscalations: 0,
      tierDistribution: { tier1: 2, tier2: 1, tier3: 0 },
      dailyVolume: [],
      completedToday: 3,
    }
    qc.setQueryData(queryKeys.dashboard(), initialStats)

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <WebSocketProvider>
            <WsConsumer />
            <DemoPanel />
          </WebSocketProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Click the Happy Path CHF scenario
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    // The DemoPanel first overrides the cache with happyPathStats (pendingCalls: 2),
    // then fires a call_completed event which decrements pendingCalls by 1 → 1.
    // This verifies the event pipeline is active: the event was processed on top of
    // the scenario cache state.
    const updatedStats = qc.getQueryData(queryKeys.dashboard()) as DashboardStats
    // After cache override (pendingCalls=2) + call_completed event (−1) = 1
    expect(updatedStats.pendingCalls).toBe(1)
    // tier1 incremented by the call_completed event (from happyPathStats.tier1=3 → 4)
    expect(updatedStats.tierDistribution.tier1).toBe(4)
  })
})
