/**
 * Integration test: WebSocket reconnection flow (Task 20.5)
 *
 * Tests the full reconnection lifecycle:
 *   - Disconnect → "Connection lost — reconnecting…" banner shown
 *   - Reconnect attempts with exponential backoff delays
 *   - Reconnect success → banner hidden → queryClient.invalidateQueries() called
 *   - After 5 failed attempts → "Connection failed — please refresh the page" shown
 *
 * Requirements: AC 7.7, 7.8, 7.9, 7.10, 7.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

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
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { AppShell } from '@/components/AppShell'
import { getIdToken } from 'firebase/auth'
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

/**
 * Render WebSocketProvider + AppShell together so the connection banners
 * rendered by AppShell are visible in the test DOM.
 */
function renderWithProviders(testQueryClient?: QueryClient) {
  const qc = testQueryClient ?? makeTestQueryClient()
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <WebSocketProvider>
            <AppShell>
              <div data-testid="page-content">Page content</div>
            </AppShell>
          </WebSocketProvider>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

/**
 * Flush the microtask queue enough times for the async getIdToken call
 * inside connect() to resolve and the WebSocket to be instantiated.
 */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocket reconnection flow — success path', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Ensure no demo mode
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "Connection lost — reconnecting…" banner immediately after disconnect', async () => {
    mockAuth({ user: fakeUser, loading: false })
    renderWithProviders()

    // Wait for initial WebSocket to be created
    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Initially no banner
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // Simulate disconnect
    act(() => {
      ws.simulateClose()
    })

    // Banner should appear
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost — reconnecting…')
  })

  it('hides the banner and calls invalidateQueries on reconnect success', async () => {
    mockAuth({ user: fakeUser, loading: false })
    const { qc } = renderWithProviders()

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Simulate open → disconnect
    act(() => {
      ws.simulateOpen()
    })
    act(() => {
      ws.simulateClose()
    })

    // Banner is shown
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost — reconnecting…')

    // Advance timer past the first backoff delay (1000ms for attempt 0)
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // A new WebSocket should have been created
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)

    // Simulate the new WebSocket opening successfully
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws2.simulateOpen()
    })

    // Banner should be gone
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // invalidateQueries should have been called (once on initial connect, once on reconnect)
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('uses exponential backoff: first reconnect after 1000ms, second after 2000ms', async () => {
    mockAuth({ user: fakeUser, loading: false })
    renderWithProviders()

    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // ── Attempt 0: delay = 1000ms ──
    act(() => {
      ws.simulateClose()
    })

    // 999ms — should not have reconnected yet
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(1)

    // 1ms more (total 1000ms) — reconnect fires
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)

    // ── Attempt 1: delay = 2000ms ──
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws2.simulateClose()
    })

    const countAfterSecondClose = MockWebSocket.instances.length

    // 1999ms — should not have reconnected yet
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(MockWebSocket.instances).toHaveLength(countAfterSecondClose)

    // 1ms more (total 2000ms) — reconnect fires
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(MockWebSocket.instances.length).toBeGreaterThan(countAfterSecondClose)
  })

  it('obtains a fresh Firebase ID token (getIdToken with forceRefresh=true) before each reconnect', async () => {
    mockAuth({ user: fakeUser, loading: false })
    renderWithProviders()

    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Clear call count from initial connection
    vi.clearAllMocks()
    ;(getIdToken as Mock).mockResolvedValue('fresh-token')

    // Simulate disconnect
    act(() => {
      ws.simulateClose()
    })

    // Advance past the first backoff delay
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // getIdToken should have been called with forceRefresh=true
    expect(getIdToken).toHaveBeenCalledWith(expect.anything(), true)

    // The new WebSocket URL should contain the fresh token
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    expect(ws2.url).toContain('/ws?token=fresh-token')
  })

  it('calls queryClient.invalidateQueries() on reconnect success to refetch active queries', async () => {
    mockAuth({ user: fakeUser, loading: false })
    const { qc } = renderWithProviders()

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Reset spy after initial connection
    invalidateSpy.mockClear()

    act(() => {
      ws.simulateOpen()
    })
    act(() => {
      ws.simulateClose()
    })

    // Advance past backoff delay
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Before reconnect success — record current call count
    const callsBefore = invalidateSpy.mock.calls.length

    act(() => {
      ws2.simulateOpen()
    })

    // After reconnect success — invalidateQueries should have been called
    expect(invalidateSpy.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

// ─── Failure path ─────────────────────────────────────────────────────────────

describe('WebSocket reconnection flow — failure path (5 failed attempts)', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "Connection failed — please refresh the page" after 5 failed reconnect attempts', async () => {
    mockAuth({ user: fakeUser, loading: false })
    renderWithProviders()

    // Wait for initial WebSocket
    await flushMicrotasks()

    // Exhaust all 5 reconnect attempts.
    // Each close triggers a reconnect timer; we advance past it so the next
    // WebSocket is created, then close that one too.
    // After 5 reconnect attempts (6 closes total), the provider gives up.
    for (let i = 0; i <= 5; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
      if (!ws) break
      act(() => {
        ws.simulateClose()
      })
      // Advance past the max backoff delay (30s) to fire the reconnect timer
      await act(async () => {
        vi.advanceTimersByTime(31_000)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    // "Connection failed" alert should be shown
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Connection failed — please refresh the page'
    )

    // "Reconnecting" banner should NOT be shown
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  }, 20_000)

  it('does not show the failure banner while reconnect attempts are still in progress', async () => {
    mockAuth({ user: fakeUser, loading: false })
    renderWithProviders()

    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]

    // Trigger first disconnect — only 1 attempt used, 4 remaining
    act(() => {
      ws.simulateClose()
    })

    // Reconnecting banner should be shown, failure banner should NOT
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost — reconnecting…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Full end-to-end reconnection flow ───────────────────────────────────────

describe('WebSocket reconnection flow — full end-to-end', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    vi.useFakeTimers()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('completes the full cycle: connect → disconnect → banner → backoff → reconnect → banner hidden → queries refetched', async () => {
    mockAuth({ user: fakeUser, loading: false })
    const { qc } = renderWithProviders()

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    // Step 1: Initial connection established
    await flushMicrotasks()
    expect(MockWebSocket.instances.length).toBeGreaterThan(0)

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws.simulateOpen()
    })

    // No banners initially
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Step 2: Simulate disconnect
    act(() => {
      ws.simulateClose()
    })

    // Step 3: "Connection lost — reconnecting…" banner shown
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost — reconnecting…')

    // Step 4: Reconnect attempt with backoff (1000ms for attempt 0)
    // Advance 999ms — no reconnect yet
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances).toHaveLength(1)

    // Advance 1ms more — reconnect fires
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)

    // Step 5: Reconnect success
    invalidateSpy.mockClear()
    const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    act(() => {
      ws2.simulateOpen()
    })

    // Step 6: Banner hidden after reconnect
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Step 7: queryClient.invalidateQueries() called to refetch active queries
    expect(invalidateSpy).toHaveBeenCalled()
  })
})
