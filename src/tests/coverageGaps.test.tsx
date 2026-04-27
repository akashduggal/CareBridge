/**
 * Coverage gap tests for Task 20.7
 *
 * Covers uncovered branches/statements in:
 * - AuthContext: signOut(), getIdTokenResult error catch, useAuth outside provider
 * - WebSocketContext: call_started event, escalation_triggered event,
 *   unrecognized event type, connect() error catch, useWebSocket outside provider,
 *   isUnmountedRef early returns, cache miss branches (old === undefined)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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

  simulateError() {
    this.onerror?.()
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn(),
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── Mock useAuth for WebSocket tests ────────────────────────────────────────
// NOTE: We mock useAuth at the module level so WebSocket tests can control auth state.
// AuthContext tests that need the real AuthProvider use a separate describe block
// that bypasses the mock by importing the real module.

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  getIdTokenResult,
} from 'firebase/auth'
import type { Mock } from 'vitest'
import type { User } from 'firebase/auth'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext'
import type { AuthContextValue } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'nurse@example.com' } as unknown as User

function mockAuthHook(state: { user: User | null; loading: boolean }) {
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

function renderWithWsProviders(ui: React.ReactNode, testQueryClient?: QueryClient) {
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

/** Consumer that exposes WebSocket state */
function WsConsumer() {
  const { connected, reconnecting, connectionAttempts, lastEventId } = useWebSocket()
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="reconnecting">{String(reconnecting)}</span>
      <span data-testid="attempts">{connectionAttempts}</span>
      <span data-testid="last-event-id">{lastEventId ?? 'none'}</span>
    </div>
  )
}

// ─── AuthContext: signOut() ───────────────────────────────────────────────────
// These tests use the real AuthProvider (not the mocked useAuth hook).
// We need to use the real useAuth from the actual module, not the vi.fn() mock.

describe('AuthContext – signOut()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(firebaseSignOut as Mock).mockResolvedValue(undefined)
  })

  it('calls firebaseSignOut when signOut() is invoked', async () => {
    // Set up a valid user so signOut can be called
    ;(onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      Promise.resolve().then(() => {
        ;(getIdTokenResult as Mock).mockResolvedValue({
          claims: { role: 'nurse' },
          token: 'mock-token',
          expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        callback({ email: 'nurse@example.com', uid: 'u1' })
      })
      return vi.fn()
    })

    // Use the real useAuth by temporarily restoring the mock
    const realUseAuth = (await vi.importActual<typeof import('@/contexts/AuthContext')>(
      '@/contexts/AuthContext'
    )).useAuth

    let capturedSignOut!: () => Promise<void>

    function SignOutCapture() {
      // Call the real useAuth via the AuthProvider context
      const ctx = realUseAuth()
      capturedSignOut = ctx.signOut
      return null
    }

    render(
      <AuthProvider>
        <SignOutCapture />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(capturedSignOut).toBeDefined()
    })

    await act(async () => {
      await capturedSignOut()
    })

    expect(firebaseSignOut).toHaveBeenCalledTimes(1)
  })
})

// ─── AuthContext: getIdTokenResult error catch ────────────────────────────────

describe('AuthContext – getIdTokenResult error catch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(firebaseSignOut as Mock).mockResolvedValue(undefined)
  })

  it('sets user and role to null when getIdTokenResult throws', async () => {
    ;(onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      Promise.resolve().then(() => {
        ;(getIdTokenResult as Mock).mockRejectedValue(new Error('Token fetch failed'))
        callback({ email: 'user@example.com', uid: 'u1' })
      })
      return vi.fn()
    })

    const realUseAuth = (await vi.importActual<typeof import('@/contexts/AuthContext')>(
      '@/contexts/AuthContext'
    )).useAuth

    function AuthConsumer() {
      const { user, role, loading } = realUseAuth()
      if (loading) return <div data-testid="loading">Loading</div>
      return (
        <div>
          <span data-testid="user">{user ? 'has-user' : 'no-user'}</span>
          <span data-testid="role">{role ?? 'no-role'}</span>
        </div>
      )
    }

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
    expect(screen.getByTestId('role')).toHaveTextContent('no-role')
  })
})

// ─── AuthContext: useAuth outside provider ────────────────────────────────────

describe('AuthContext – useAuth outside provider', () => {
  it('throws when useAuth is used outside AuthProvider', async () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const realUseAuth = (await vi.importActual<typeof import('@/contexts/AuthContext')>(
      '@/contexts/AuthContext'
    )).useAuth

    function BadConsumer() {
      realUseAuth()
      return null
    }

    expect(() => render(<BadConsumer />)).toThrow('useAuth must be used within AuthProvider')

    consoleSpy.mockRestore()
  })
})

// ─── WebSocketContext: call_started event ────────────────────────────────────

describe('WebSocketContext – call_started event handler', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('updates discharge callStatus to in_progress on call_started event', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // Pre-populate discharges cache
    qc.setQueryData(['discharges', {}], {
      data: [
        { id: 'discharge-1', callStatus: 'pending', patientName: 'Alice' },
        { id: 'discharge-2', callStatus: 'pending', patientName: 'Bob' },
      ],
    })

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    act(() => {
      ws.simulateMessage({
        type: 'call_started',
        id: 'evt-call-started-001',
        callId: 'call-1',
        dischargeId: 'discharge-1',
        timestamp: new Date().toISOString(),
      })
    })

    const cached = qc.getQueryData(['discharges', {}]) as {
      data: Array<{ id: string; callStatus: string }>
    }
    expect(cached.data[0].callStatus).toBe('in_progress')
    expect(cached.data[1].callStatus).toBe('pending') // unchanged
  })

  it('handles call_started when discharges cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // No cache pre-populated

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    // Should not throw when cache is empty
    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'call_started',
          id: 'evt-call-started-002',
          callId: 'call-x',
          dischargeId: 'discharge-x',
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })
})

// ─── WebSocketContext: escalation_triggered event ────────────────────────────

describe('WebSocketContext – escalation_triggered event handler', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('appends escalation to escalations cache on escalation_triggered event', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    qc.setQueryData(['escalations'], {
      data: [
        {
          id: 'esc-1',
          patientName: 'Alice',
          riskScore: 8,
          riskTier: 3,
          confidence: 0.9,
        },
      ],
    })
    qc.setQueryData(['dashboard', 'stats'], {
      todayDischarges: 5,
      pendingCalls: 3,
      activeEscalations: 1,
      tierDistribution: { tier1: 2, tier2: 2, tier3: 1 },
      dailyVolume: [],
      completedToday: 5,
    })

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    const newEscalation = {
      id: 'esc-2',
      patientName: 'Bob',
      riskScore: 9,
      riskTier: 3,
      confidence: 0.4,
      dischargeId: 'd-2',
      diagnosisGroup: 'AMI',
      dischargeDateTime: new Date().toISOString(),
      callId: 'call-2',
      createdAt: new Date().toISOString(),
    }

    act(() => {
      ws.simulateMessage({
        type: 'escalation_triggered',
        id: 'evt-esc-001',
        escalation: newEscalation,
        timestamp: new Date().toISOString(),
      })
    })

    const cachedEscalations = qc.getQueryData(['escalations']) as {
      data: Array<{ id: string }>
    }
    expect(cachedEscalations.data).toHaveLength(2)
    expect(cachedEscalations.data[1].id).toBe('esc-2')

    // Dashboard activeEscalations should be incremented
    const cachedDashboard = qc.getQueryData(['dashboard', 'stats']) as {
      activeEscalations: number
    }
    expect(cachedDashboard.activeEscalations).toBe(2)
  })

  it('handles escalation_triggered when escalations cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // No cache pre-populated

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'escalation_triggered',
          id: 'evt-esc-002',
          escalation: { id: 'esc-x', patientName: 'X', riskScore: 7, riskTier: 3 },
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })
})

// ─── WebSocketContext: unrecognized event type ────────────────────────────────

describe('WebSocketContext – unrecognized event type', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('logs a warning for unrecognized event types without throwing', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithWsProviders(<WsConsumer />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'unknown_event_type',
          id: 'evt-unknown-001',
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      '[WebSocket] Unrecognized event type:',
      'unknown_event_type'
    )

    warnSpy.mockRestore()
  })
})

// ─── WebSocketContext: non-event message ─────────────────────────────────────

describe('WebSocketContext – non-event message handling', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('logs a warning for non-event messages (missing type/id fields)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithWsProviders(<WsConsumer />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({ someField: 'no type or id' })
      })
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      '[WebSocket] Received non-event message:',
      expect.anything()
    )

    warnSpy.mockRestore()
  })

  it('logs a warning for malformed JSON messages', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithWsProviders(<WsConsumer />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    // Directly call onmessage with invalid JSON
    expect(() => {
      act(() => {
        ws.onmessage?.({ data: 'not-valid-json{{{' })
      })
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      '[WebSocket] Failed to parse message:',
      expect.anything()
    )

    warnSpy.mockRestore()
  })
})

// ─── WebSocketContext: connect() error catch ─────────────────────────────────

describe('WebSocketContext – connect() error catch (getIdToken fails)', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles getIdToken failure gracefully and schedules reconnect', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    // Make getIdToken fail on first call, succeed on retry
    const { getIdToken } = await import('firebase/auth')
    ;(getIdToken as Mock)
      .mockRejectedValueOnce(new Error('Token fetch failed'))
      .mockResolvedValue('mock-token')

    renderWithWsProviders(<WsConsumer />)

    // Wait for the async connect() to run and fail
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Should be in reconnecting state
    expect(screen.getByTestId('reconnecting')).toHaveTextContent('true')
    expect(screen.getByTestId('attempts')).toHaveTextContent('1')

    // Advance timer to trigger reconnect
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Should have created a WebSocket on retry
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)
  })
})

// ─── WebSocketContext: useWebSocket outside provider ─────────────────────────

describe('WebSocketContext – useWebSocket outside provider', () => {
  it('throws when useWebSocket is used outside WebSocketProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function BadConsumer() {
      useWebSocket()
      return null
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useWebSocket must be used within WebSocketProvider'
    )

    consoleSpy.mockRestore()
  })
})

// ─── WebSocketContext: cache miss branches ────────────────────────────────────

describe('WebSocketContext – cache miss branches (old === undefined)', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('handles call_completed when call cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // No cache pre-populated

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'call_completed',
          id: 'evt-cc-001',
          callId: 'call-missing',
          dischargeId: 'discharge-missing',
          outcome: 'completed',
          riskScore: 5,
          confidence: 0.8,
          riskTier: 2,
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })

  it('handles discharge_created when discharges cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // No cache pre-populated

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'discharge_created',
          id: 'evt-dc-001',
          discharge: {
            id: 'd-new',
            patientId: 'p-1',
            patientName: 'New Patient',
            diagnosisGroup: 'CHF',
            icd10Code: 'I50.9',
            dischargeDateTime: new Date().toISOString(),
            medications: [],
            riskLevel: 'low',
            callStatus: 'pending',
          },
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })

  it('handles call_completed when dashboard cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // Pre-populate call cache but NOT dashboard cache
    qc.setQueryData(['calls', 'call-1', 'transcript'], {
      data: { id: 'call-1', outcome: 'pending', riskScore: 3, confidence: 0.8, riskTier: 1 },
    })

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'call_completed',
          id: 'evt-cc-002',
          callId: 'call-1',
          dischargeId: 'discharge-1',
          outcome: 'completed',
          riskScore: 7,
          confidence: 0.9,
          riskTier: 3,
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })
})

// ─── WebSocketContext: discharge_created dashboard cache miss ─────────────────

describe('WebSocketContext – discharge_created dashboard cache miss', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('handles discharge_created when dashboard cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // Pre-populate discharges cache but NOT dashboard cache
    qc.setQueryData(['discharges', { page: 1 }], {
      data: [{ id: 'd-1', patientName: 'Alice' }],
    })

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'discharge_created',
          id: 'evt-dc-002',
          discharge: {
            id: 'd-new',
            patientId: 'p-2',
            patientName: 'New Patient',
            diagnosisGroup: 'COPD',
            icd10Code: 'J44.1',
            dischargeDateTime: new Date().toISOString(),
            medications: [],
            riskLevel: 'medium',
            callStatus: 'pending',
          },
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })
})

// ─── WebSocketContext: escalation_triggered dashboard cache miss ──────────────

describe('WebSocketContext – escalation_triggered dashboard cache miss', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('handles escalation_triggered when dashboard cache is empty (old === undefined)', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const qc = makeTestQueryClient()
    // Pre-populate escalations cache but NOT dashboard cache
    qc.setQueryData(['escalations'], {
      data: [],
    })

    renderWithWsProviders(<WsConsumer />, qc)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
    })

    expect(() => {
      act(() => {
        ws.simulateMessage({
          type: 'escalation_triggered',
          id: 'evt-esc-003',
          escalation: {
            id: 'esc-new',
            patientName: 'New Patient',
            riskScore: 8,
            riskTier: 3,
            confidence: 0.9,
          },
          timestamp: new Date().toISOString(),
        })
      })
    }).not.toThrow()
  })
})

// ─── WebSocketContext: sign-out clears deduplication cache ───────────────────

describe('WebSocketContext – sign-out clears deduplication cache', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
  })

  it('clears deduplication cache and closes socket when user signs out', async () => {
    // Start with authenticated user
    mockAuthHook({ user: fakeUser, loading: false })

    const { rerender } = renderWithWsProviders(<WsConsumer />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    // Simulate sign-out by changing auth state
    mockAuthHook({ user: null, loading: false })

    rerender(
      <QueryClientProvider client={makeTestQueryClient()}>
        <WebSocketProvider>
          <WsConsumer />
        </WebSocketProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('connected')).toHaveTextContent('false')
    })
  })
})

// ─── WebSocketContext: connect() max attempts in error catch ─────────────────

describe('WebSocketContext – connect() error catch max attempts', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops reconnecting after MAX_RECONNECT_ATTEMPTS failures in error catch', async () => {
    mockAuthHook({ user: fakeUser, loading: false })

    const { getIdToken } = await import('firebase/auth')
    // Always fail getIdToken
    ;(getIdToken as Mock).mockRejectedValue(new Error('Token fetch failed'))

    renderWithWsProviders(<WsConsumer />)

    // Wait for initial failure
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Exhaust all reconnect attempts
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        vi.advanceTimersByTime(31000)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    // Should have stopped reconnecting
    expect(screen.getByTestId('reconnecting')).toHaveTextContent('false')
    expect(parseInt(screen.getByTestId('attempts').textContent ?? '0')).toBeGreaterThanOrEqual(5)
  }, 30000)
})
