/**
 * Tests for Task 17.7 — Demo Mode REST API interception
 * Tests for Task 17.9 — No outbound network requests in Demo Mode
 *
 * Verifies:
 *   - activateDemoInterceptor patches globalThis.fetch
 *   - All known API endpoints resolve against mock data (no real network)
 *   - deactivateDemoInterceptor restores the original fetch
 *   - Switching scenarios updates the interceptor to the new scenario's data
 *   - DemoPanel activates the interceptor when a scenario button is clicked
 *   - No real fetch calls are made while the interceptor is active
 *
 * Requirements 8.12 (Demo Mode network isolation)
 * Correctness Property: Demo Mode Network Isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn(),
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
import { DemoPanel } from '@/components/DemoPanel'
import {
  activateDemoInterceptor,
  deactivateDemoInterceptor,
  isDemoInterceptorActive,
} from '@/mocks/demoApiInterceptor'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
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

function renderDemoPanel(initialPath = '/dashboard?demo=true') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <DemoPanel />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── Unit tests for demoApiInterceptor module ─────────────────────────────────

describe('17.7 – demoApiInterceptor: activateDemoInterceptor patches fetch', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
  })

  it('isDemoInterceptorActive() returns false before activation', () => {
    expect(isDemoInterceptorActive()).toBe(false)
  })

  it('isDemoInterceptorActive() returns true after activation', () => {
    activateDemoInterceptor('happy-path-chf')
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('isDemoInterceptorActive() returns false after deactivation', () => {
    activateDemoInterceptor('happy-path-chf')
    deactivateDemoInterceptor()
    expect(isDemoInterceptorActive()).toBe(false)
  })

  it('replaces globalThis.fetch with the interceptor', () => {
    const before = globalThis.fetch
    activateDemoInterceptor('happy-path-chf')
    expect(globalThis.fetch).not.toBe(before)
  })

  it('restores the original fetch after deactivation', () => {
    const before = globalThis.fetch
    activateDemoInterceptor('happy-path-chf')
    deactivateDemoInterceptor()
    expect(globalThis.fetch).toBe(before)
  })

  it('deactivateDemoInterceptor is safe to call when not active', () => {
    expect(() => deactivateDemoInterceptor()).not.toThrow()
  })
})

// ─── Endpoint resolution tests ────────────────────────────────────────────────

describe('17.7 – demoApiInterceptor: resolves known endpoints against mock data', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
  })

  it('GET /dashboard/stats returns scenario stats (no real network)', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/dashboard/stats')
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })

  it('GET /discharges returns scenario discharges', async () => {
    activateDemoInterceptor('medium-risk-copd')
    const response = await globalThis.fetch('/discharges')
    expect(response.ok).toBe(true)
    const body = await response.json()
    // Interceptor applies pagination + sorting; verify total matches scenario
    expect(body.meta.total).toBe(DEMO_SCENARIOS['medium-risk-copd'].discharges.data.length)
    expect(body.data.length).toBeGreaterThan(0)
  })

  it('GET /escalations returns scenario escalations', async () => {
    activateDemoInterceptor('emergency-chest-pain')
    const response = await globalThis.fetch('/escalations')
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
  })

  it('GET /patients returns scenario patients', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/patients')
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].patients)
  })

  it('GET /calls/:id/transcript returns scenario call transcript', async () => {
    const scenario = DEMO_SCENARIOS['happy-path-chf']
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch(`/calls/${scenario.call.id}/transcript`)
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(scenario.call.transcript)
  })

  it('GET /calls/unknown-id/transcript returns 404', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/calls/unknown-call-id/transcript')
    expect(response.status).toBe(404)
  })

  it('POST /patients returns scenario patient', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/patients', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Patient' }),
    })
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].patient)
  })

  it('POST /discharges returns scenario discharge', async () => {
    activateDemoInterceptor('emergency-chest-pain')
    const response = await globalThis.fetch('/discharges', {
      method: 'POST',
      body: JSON.stringify({ patientId: 'demo-patient-ami-001' }),
    })
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].discharge)
  })

  it('returns 200 with JSON content-type for known endpoints', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/dashboard/stats')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('works with full URL including query params', async () => {
    activateDemoInterceptor('medium-risk-copd')
    const response = await globalThis.fetch('/discharges?page=1&limit=25')
    expect(response.ok).toBe(true)
    const body = await response.json()
    // Interceptor applies pagination + sorting; verify meta is correct
    expect(body.meta.page).toBe(1)
    expect(body.meta.limit).toBe(25)
    expect(body.meta.total).toBe(DEMO_SCENARIOS['medium-risk-copd'].discharges.data.length)
  })

  it('works with api/ prefix in URL path', async () => {
    activateDemoInterceptor('happy-path-chf')
    const response = await globalThis.fetch('/api/dashboard/stats')
    expect(response.ok).toBe(true)
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })
})

// ─── Scenario switching tests ─────────────────────────────────────────────────

describe('17.7 – demoApiInterceptor: switching scenarios updates mock data', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
  })

  it('switching from CHF to COPD updates the intercepted response', async () => {
    activateDemoInterceptor('happy-path-chf')
    const chfResponse = await globalThis.fetch('/dashboard/stats')
    const chfBody = await chfResponse.json()
    expect(chfBody).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)

    // Switch scenario
    activateDemoInterceptor('medium-risk-copd')
    const copdResponse = await globalThis.fetch('/dashboard/stats')
    const copdBody = await copdResponse.json()
    expect(copdBody).toEqual(DEMO_SCENARIOS['medium-risk-copd'].stats)
  })

  it('switching scenarios does not double-patch fetch', () => {
    const before = globalThis.fetch
    activateDemoInterceptor('happy-path-chf')
    const afterFirst = globalThis.fetch
    activateDemoInterceptor('medium-risk-copd')
    const afterSecond = globalThis.fetch

    // Both activations should replace fetch (not the same as original)
    expect(afterFirst).not.toBe(before)
    expect(afterSecond).not.toBe(before)

    // After deactivation, original is restored
    deactivateDemoInterceptor()
    expect(globalThis.fetch).toBe(before)
  })
})

// ─── Network isolation: no real fetch calls ───────────────────────────────────

describe('17.9 – Demo Mode: no outbound network requests', () => {
  let originalFetch: typeof globalThis.fetch
  let realFetchSpy: Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    realFetchSpy = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
  })

  it('does not call the real fetch when interceptor is active', async () => {
    // Install a spy as the "real" fetch before activating the interceptor
    globalThis.fetch = realFetchSpy
    activateDemoInterceptor('happy-path-chf')

    // Make several API calls
    await globalThis.fetch('/dashboard/stats')
    await globalThis.fetch('/discharges')
    await globalThis.fetch('/escalations')
    await globalThis.fetch('/patients')

    // The real fetch spy should never have been called
    expect(realFetchSpy).not.toHaveBeenCalled()
  })

  it('real fetch is callable again after deactivation', async () => {
    globalThis.fetch = realFetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )
    activateDemoInterceptor('happy-path-chf')
    deactivateDemoInterceptor()

    // Now the real fetch should be called
    await globalThis.fetch('/some-endpoint')
    expect(realFetchSpy).toHaveBeenCalledOnce()
  })
})

// ─── DemoPanel integration: interceptor activated on scenario click ───────────

describe('17.7 – DemoPanel: activates fetch interceptor on scenario click', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    globalThis.fetch = originalFetch
  })

  it('interceptor is active on mount (auto-activated with default scenario)', () => {
    renderDemoPanel()
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor is active after clicking "Happy Path CHF"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor is active after clicking "Medium Risk COPD"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('interceptor is active after clicking "Emergency Chest Pain"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    expect(isDemoInterceptorActive()).toBe(true)
  })

  it('fetch resolves against CHF mock data after clicking "Happy Path CHF"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    const response = await globalThis.fetch('/dashboard/stats')
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })

  it('fetch resolves against emergency mock data after clicking "Emergency Chest Pain"', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const response = await globalThis.fetch('/escalations')
    const body = await response.json()
    expect(body).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
    // Emergency scenario has an active escalation
    expect(body.data).toHaveLength(1)
    expect(body.data[0].riskTier).toBe(3)
  })

  it('switching scenarios updates the intercepted data', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    // Activate CHF
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    const chfResponse = await globalThis.fetch('/dashboard/stats')
    const chfBody = await chfResponse.json()
    expect(chfBody.pendingCalls).toBe(DEMO_SCENARIOS['happy-path-chf'].stats.pendingCalls)

    // Switch to Emergency
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    const emergencyResponse = await globalThis.fetch('/dashboard/stats')
    const emergencyBody = await emergencyResponse.json()
    expect(emergencyBody.pendingCalls).toBe(
      DEMO_SCENARIOS['emergency-chest-pain'].stats.pendingCalls
    )
  })
})
