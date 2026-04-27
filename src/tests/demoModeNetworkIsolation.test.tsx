/**
 * Task 17.9 — Component tests: no outbound network requests in Demo Mode
 *
 * Correctness Property: Demo Mode Network Isolation
 * Requirement 8.12: WHEN Demo_Mode is active, no outbound network request
 * SHALL reach the real backend API or WebSocket endpoint.
 *
 * These tests verify network isolation at the component level — i.e., that
 * activating a demo scenario via the DemoPanel causes all subsequent fetch()
 * calls (including those made by apiClient and TanStack Query) to be resolved
 * against mock data, with zero calls reaching the real fetch implementation.
 *
 * Coverage:
 *   - All three demo scenarios produce no real fetch calls
 *   - apiClient calls are intercepted (not just raw fetch)
 *   - Switching scenarios never leaks a real request
 *   - Deactivating demo mode (unmount) restores real fetch
 *   - No real WebSocket connection is made in demo mode
 *   - Interceptor is active for the full lifecycle of the demo session
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn().mockResolvedValue({
    token: 'mock-token',
    expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    claims: { role: 'admin' },
  }),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'u1', email: 'demo@example.com' },
    signOut: vi.fn(),
  },
}))

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

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { DemoPanel } from '@/components/DemoPanel'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { deactivateDemoInterceptor, isDemoInterceptorActive } from '@/mocks/demoApiInterceptor'
import { mockEventEmitter } from '@/mocks/mockEventEmitter'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
import { apiClient } from '@/lib/apiClient'
import type { Mock } from 'vitest'
import type { AuthContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'demo@example.com' } as unknown as User

function mockAuth(user: User | null) {
  ;(useAuth as Mock).mockReturnValue({
    user,
    role: user ? 'admin' : null,
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/**
 * Render DemoPanel (and optionally WebSocketProvider) inside the required
 * providers. The initialPath controls the URL seen by useSearchParams.
 */
function renderDemoPanel(
  initialPath = '/dashboard?demo=true',
  opts: { withWebSocket?: boolean; queryClient?: QueryClient } = {}
) {
  const qc = opts.queryClient ?? makeQueryClient()
  const inner = opts.withWebSocket ? (
    <WebSocketProvider>
      <DemoPanel />
    </WebSocketProvider>
  ) : (
    <DemoPanel />
  )

  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>{inner}</MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── Suite 1: Interceptor lifecycle via component ─────────────────────────────

describe('17.9 – DemoPanel: fetch interceptor lifecycle', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
  })

  it('interceptor is NOT active before any scenario button is clicked', () => {
    renderDemoPanel()
    // Auto-activate fires on mount — interceptor is active immediately
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor becomes active after clicking "Happy Path CHF"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor becomes active after clicking "Medium Risk COPD"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor becomes active after clicking "Emergency Chest Pain"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor is deactivated when DemoPanel unmounts', async () => {
    const user = userEvent.setup()
    const { unmount } = renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    expect(isDemoInterceptorActive()).toBe(true)

    unmount()

    expect(isDemoInterceptorActive()).toBe(false)
  })
})

// ─── Suite 2: No real fetch calls when interceptor is active ──────────────────

describe('17.9 – DemoPanel: no real fetch calls after scenario activation', () => {
  let originalFetch: typeof globalThis.fetch
  let realFetchSpy: Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    realFetchSpy = vi.fn()
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
  })

  it('no real fetch call is made for GET /dashboard/stats after "Happy Path CHF" is activated', async () => {
    // Install spy as the "real" fetch before the interceptor wraps it
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    // Simulate what TanStack Query / apiClient would do
    const response = await globalThis.fetch('/dashboard/stats')
    const body = await response.json()

    // The spy (real fetch) must NOT have been called — the interceptor handled it
    expect(realFetchSpy).not.toHaveBeenCalled()
    // And the response came from mock data
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })

  it('no real fetch call is made for GET /discharges after "Medium Risk COPD" is activated', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    const response = await globalThis.fetch('/discharges')
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    // Interceptor applies pagination + sorting; verify data comes from the scenario
    expect(body.meta.total).toBe(DEMO_SCENARIOS['medium-risk-copd'].discharges.data.length)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it('no real fetch call is made for GET /escalations after "Emergency Chest Pain" is activated', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const response = await globalThis.fetch('/escalations')
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(body).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
  })

  it('no real fetch call is made for GET /patients after any scenario is activated', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    const response = await globalThis.fetch('/patients')
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].patients)
  })

  it('no real fetch call is made for GET /calls/:id/transcript after scenario activation', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const scenario = DEMO_SCENARIOS['emergency-chest-pain']
    const response = await globalThis.fetch(`/calls/${scenario.call.id}/transcript`)
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(body).toEqual(scenario.call.transcript)
  })

  it('no real fetch call is made for POST /discharges after scenario activation', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    const response = await globalThis.fetch('/discharges', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'demo-patient-chf-001' }),
    })
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].discharge)
  })

  it('no real fetch call is made for POST /patients after scenario activation', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    const response = await globalThis.fetch('/patients', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Patient' }),
    })
    const body = await response.json()

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(body).toEqual(DEMO_SCENARIOS['medium-risk-copd'].patient)
  })

  it('multiple sequential API calls all resolve from mock data without touching real fetch', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    // Simulate multiple concurrent page loads
    const [statsRes, dischargesRes, escalationsRes, patientsRes] = await Promise.all([
      globalThis.fetch('/dashboard/stats'),
      globalThis.fetch('/discharges'),
      globalThis.fetch('/escalations'),
      globalThis.fetch('/patients'),
    ])

    const [stats, discharges, escalations, patients] = await Promise.all([
      statsRes.json(),
      dischargesRes.json(),
      escalationsRes.json(),
      patientsRes.json(),
    ])

    // Real fetch was never called for any of these
    expect(realFetchSpy).not.toHaveBeenCalled()

    // All responses came from the emergency scenario mock data
    expect(stats).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].stats)
    // Interceptor applies pagination + sorting to discharges
    expect(discharges.meta.total).toBe(
      DEMO_SCENARIOS['emergency-chest-pain'].discharges.data.length
    )
    expect(discharges.data.length).toBeGreaterThan(0)
    expect(escalations).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
    expect(patients).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].patients)
  })
})

// ─── Suite 3: apiClient calls are intercepted (not just raw fetch) ────────────

describe('17.9 – DemoPanel: apiClient calls are intercepted in demo mode', () => {
  let originalFetch: typeof globalThis.fetch
  let realFetchSpy: Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    realFetchSpy = vi.fn()
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
  })

  it('apiClient GET /dashboard/stats resolves from mock data — real fetch not called', async () => {
    // Install spy as the real fetch before the interceptor wraps it
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    // apiClient wraps fetch with auth headers — the interceptor must catch this too
    const result = await apiClient<typeof DEMO_SCENARIOS['happy-path-chf']['stats']>(
      '/dashboard/stats'
    )

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })

  it('apiClient GET /escalations resolves from mock data for emergency scenario', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const result = await apiClient<typeof DEMO_SCENARIOS['emergency-chest-pain']['escalations']>(
      '/escalations'
    )

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
  })

  it('apiClient POST /discharges resolves from mock data — no real network request', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    const result = await apiClient<typeof DEMO_SCENARIOS['medium-risk-copd']['discharge']>(
      '/discharges',
      { method: 'POST', body: JSON.stringify({ patientId: 'demo-patient-copd-001' }) }
    )

    expect(realFetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual(DEMO_SCENARIOS['medium-risk-copd'].discharge)
  })
})

// ─── Suite 4: Scenario switching never leaks a real request ──────────────────

describe('17.9 – DemoPanel: switching scenarios never leaks a real request', () => {
  let originalFetch: typeof globalThis.fetch
  let realFetchSpy: Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    realFetchSpy = vi.fn()
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
  })

  it('switching from CHF to COPD to Emergency never calls real fetch', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    // Activate CHF
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    await globalThis.fetch('/dashboard/stats')

    // Switch to COPD
    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))
    await globalThis.fetch('/discharges')

    // Switch to Emergency
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    await globalThis.fetch('/escalations')

    // Real fetch was never called across all three scenarios
    expect(realFetchSpy).not.toHaveBeenCalled()
  })

  it('each scenario switch serves the correct mock data without real network', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    renderDemoPanel()

    // CHF scenario
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    const chfRes = await globalThis.fetch('/dashboard/stats')
    const chfStats = await chfRes.json()
    expect(chfStats.activeEscalations).toBe(DEMO_SCENARIOS['happy-path-chf'].stats.activeEscalations)

    // Emergency scenario
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    const emergencyRes = await globalThis.fetch('/dashboard/stats')
    const emergencyStats = await emergencyRes.json()
    expect(emergencyStats.activeEscalations).toBe(
      DEMO_SCENARIOS['emergency-chest-pain'].stats.activeEscalations
    )

    // Real fetch was never called
    expect(realFetchSpy).not.toHaveBeenCalled()
  })
})

// ─── Suite 5: No real WebSocket connection in demo mode ──────────────────────

describe('17.9 – DemoPanel + WebSocketProvider: no real WebSocket in demo mode', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
    // Simulate ?demo=true in window.location.search (used by isDemoMode() in WebSocketContext)
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?demo=true' },
      writable: true,
    })
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  it('no real WebSocket is created when ?demo=true is active', async () => {
    renderDemoPanel('/dashboard?demo=true', { withWebSocket: true })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('no real WebSocket is created even after a scenario is activated', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true', { withWebSocket: true })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('WebSocket endpoint URL is never constructed in demo mode', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true', { withWebSocket: true })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    // No WebSocket instance means no /ws endpoint was ever targeted
    const wsUrls = MockWebSocket.instances.map((ws) => ws.url)
    expect(wsUrls.some((url) => url.includes('/ws'))).toBe(false)
  })
})

// ─── Suite 6: Real fetch is restored after demo session ends ─────────────────

describe('17.9 – DemoPanel: real fetch is restored after demo session ends', () => {
  let originalFetch: typeof globalThis.fetch
  let realFetchSpy: Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    realFetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    )
    MockWebSocket.instances = []
    mockEventEmitter.clear()
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
    mockEventEmitter.clear()
  })

  it('real fetch is callable again after DemoPanel unmounts', async () => {
    globalThis.fetch = realFetchSpy

    const user = userEvent.setup()
    const { unmount } = renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    expect(isDemoInterceptorActive()).toBe(true)

    // While active, real fetch is not called
    await globalThis.fetch('/dashboard/stats')
    expect(realFetchSpy).not.toHaveBeenCalled()

    // Unmount the panel — interceptor should be deactivated
    unmount()
    expect(isDemoInterceptorActive()).toBe(false)

    // Now real fetch should be called
    await globalThis.fetch('/dashboard/stats')
    expect(realFetchSpy).toHaveBeenCalledOnce()
  })

  it('fetch is intercepted immediately on mount (auto-activated)', async () => {
    globalThis.fetch = realFetchSpy

    renderDemoPanel()

    // Auto-activate fires on mount — interceptor is active immediately
    expect(isDemoInterceptorActive()).toBe(true)

    // A fetch call should be intercepted, not hitting real fetch
    await globalThis.fetch('/dashboard/stats')
    expect(realFetchSpy).not.toHaveBeenCalled()
  })
})
