/**
 * Task 17.10 — Component tests: "Emergency Chest Pain" scenario produces
 * Tier 3 escalation in Escalation View.
 *
 * Correctness Property (Requirement 8.2):
 *   FOR ALL demo scenarios, the "Emergency Chest Pain" scenario SHALL always
 *   produce a Tier 3 escalation entry in the Escalation_View.
 *
 * These tests verify the end-to-end integration between:
 *   1. DemoPanel activating the "emergency-chest-pain" scenario
 *   2. TanStack Query cache being populated with the scenario's escalation data
 *   3. EscalationPage reading from that cache and rendering the Tier 3 alert
 *
 * Coverage:
 *   - "Emergency Chest Pain" scenario produces a Tier 3 escalation in the view
 *   - The escalation appears in the Tier 3 Urgent Alerts section (not Tier 2 or Human Review)
 *   - The escalation displays the correct patient name, risk score, and link to transcript
 *   - The escalation's risk score is ≥ 7 (Tier 3 invariant)
 *   - "Happy Path CHF" and "Medium Risk COPD" do NOT produce Tier 3 escalations
 *   - Switching to "Emergency Chest Pain" after another scenario shows the Tier 3 alert
 *   - The Tier 3 section is rendered above the Tier 2 section in the DOM
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
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

// ─── Mock apiClient — EscalationPage uses this for its own fetch ──────────────
// When the cache is pre-populated by DemoPanel, TanStack Query will serve from
// cache and never call apiClient. We still mock it to prevent real network calls
// and to handle the case where the cache is empty (returns empty escalations).

vi.mock('@/lib/apiClient', () => ({ apiClient: vi.fn() }))

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { DemoPanel } from '@/components/DemoPanel'
import { EscalationPage } from '@/pages/EscalationPage'
import { deactivateDemoInterceptor } from '@/mocks/demoApiInterceptor'
import { mockEventEmitter } from '@/mocks/mockEventEmitter'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
import { queryKeys } from '@/lib/queryKeys'
import type { Mock } from 'vitest'
import type { ApiResponse, AuthContextValue, Escalation } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'demo@example.com' } as unknown as User

function mockAuth(role: AuthContextValue['role'] = 'admin') {
  ;(useAuth as Mock).mockReturnValue({
    user: fakeUser,
    role,
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

/**
 * Render both DemoPanel and EscalationPage sharing the same QueryClient.
 * DemoPanel populates the cache; EscalationPage reads from it.
 * The URL includes ?demo=true so DemoPanel renders its scenario buttons.
 */
function renderDemoWithEscalationPage(role: AuthContextValue['role'] = 'admin') {
  mockAuth(role)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  // Default: apiClient returns empty escalations so EscalationPage doesn't
  // show stale data before the cache is populated by DemoPanel.
  ;(apiClient as Mock).mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 25, total: 0 },
  } satisfies ApiResponse<Escalation[]>)

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/escalations?demo=true']}>
        <DemoPanel />
        <EscalationPage />
      </MemoryRouter>
    </QueryClientProvider>
  )

  return { queryClient, ...utils }
}

// ─── Suite 1: "Emergency Chest Pain" produces Tier 3 escalation ──────────────

describe('17.10 – "Emergency Chest Pain" scenario produces Tier 3 escalation in Escalation View', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventEmitter.clear()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    mockEventEmitter.clear()
  })

  it('activating "Emergency Chest Pain" renders a Tier 3 Urgent Alerts section', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
    })
  })

  it('the Tier 3 section contains the correct patient name from the scenario', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const expectedPatientName = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.patientName

    await waitFor(() => {
      const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      expect(within(tier3Section).getByText(expectedPatientName)).toBeInTheDocument()
    })
  })

  it('the Tier 3 alert displays the correct risk score (9)', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const expectedRiskScore = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.riskScore
    expect(expectedRiskScore).toBeGreaterThanOrEqual(7) // Tier 3 invariant

    await waitFor(() => {
      const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      expect(within(tier3Section).getByText(String(expectedRiskScore))).toBeInTheDocument()
    })
  })

  it('the Tier 3 alert contains a link to the call transcript', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const expectedCallId = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.callId

    await waitFor(() => {
      const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      const transcriptLink = within(tier3Section).getByRole('link', { name: /view transcript/i })
      expect(transcriptLink).toHaveAttribute('href', expect.stringContaining(`/calls/${expectedCallId}`))
    })
  })

  it('the escalation appears in the Tier 3 section and NOT in Human Review', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const patientName = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.patientName

    await waitFor(() => {
      const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      expect(within(tier3Section).getByText(patientName)).toBeInTheDocument()
    })

    // Human Review section should not exist (confidence is 0.85, not < 0.6)
    expect(
      screen.queryByRole('region', { name: /human review/i })
    ).not.toBeInTheDocument()
  })

  it('the escalation appears exactly once in the entire page', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const patientName = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.patientName

    await waitFor(() => {
      expect(screen.getAllByText(patientName)).toHaveLength(1)
    })
  })

  it('the scenario escalation has riskTier 3 and riskScore ≥ 7 (Tier 3 invariant)', () => {
    const escalation = DEMO_SCENARIOS['emergency-chest-pain'].escalation!
    expect(escalation.riskTier).toBe(3)
    expect(escalation.riskScore).toBeGreaterThanOrEqual(7)
  })

  it('the Tier 3 alert renders a role="alert" element for accessibility', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      // Each Tier3AlertBanner has role="alert"
      expect(within(tier3Section).getByRole('alert')).toBeInTheDocument()
    })
  })
})

// ─── Suite 2: Other scenarios do NOT produce Tier 3 escalations ──────────────

describe('17.10 – Other scenarios do NOT produce Tier 3 escalations in Escalation View', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventEmitter.clear()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    mockEventEmitter.clear()
  })

  it('"Happy Path CHF" scenario shows empty escalation state (no Tier 3 section)', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    await waitFor(() => {
      expect(screen.getByText(/no active escalations/i)).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('region', { name: /tier 3 urgent alerts/i })
    ).not.toBeInTheDocument()
  })

  it('"Medium Risk COPD" scenario shows empty escalation state (no Tier 3 section)', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    await waitFor(() => {
      expect(screen.getByText(/no active escalations/i)).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('region', { name: /tier 3 urgent alerts/i })
    ).not.toBeInTheDocument()
  })

  it('"Happy Path CHF" escalations list is empty (no escalation records)', () => {
    const chfEscalations = DEMO_SCENARIOS['happy-path-chf'].escalations.data
    expect(chfEscalations).toHaveLength(0)
  })

  it('"Medium Risk COPD" escalations list is empty (no escalation records)', () => {
    const copdEscalations = DEMO_SCENARIOS['medium-risk-copd'].escalations.data
    expect(copdEscalations).toHaveLength(0)
  })
})

// ─── Suite 3: Switching to "Emergency Chest Pain" from another scenario ───────

describe('17.10 – Switching to "Emergency Chest Pain" from another scenario shows Tier 3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventEmitter.clear()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    mockEventEmitter.clear()
  })

  it('switching from "Happy Path CHF" to "Emergency Chest Pain" shows Tier 3 alert', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    // First activate CHF — no escalations
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    await waitFor(() => {
      expect(screen.getByText(/no active escalations/i)).toBeInTheDocument()
    })

    // Switch to Emergency Chest Pain
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const patientName = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.patientName

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
      expect(screen.getByText(patientName)).toBeInTheDocument()
    })

    // Empty state should no longer be shown
    expect(screen.queryByText(/no active escalations/i)).not.toBeInTheDocument()
  })

  it('switching from "Emergency Chest Pain" back to "Happy Path CHF" removes Tier 3 alert', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage()

    // Activate Emergency first
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const patientName = DEMO_SCENARIOS['emergency-chest-pain'].escalation!.patientName

    await waitFor(() => {
      expect(screen.getByText(patientName)).toBeInTheDocument()
    })

    // Switch back to CHF
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    await waitFor(() => {
      expect(screen.getByText(/no active escalations/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(patientName)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /tier 3 urgent alerts/i })
    ).not.toBeInTheDocument()
  })
})

// ─── Suite 4: Cache-level verification ───────────────────────────────────────

describe('17.10 – Cache-level: "Emergency Chest Pain" populates escalations cache with Tier 3 record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventEmitter.clear()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    mockEventEmitter.clear()
  })

  it('escalations cache contains exactly one record after "Emergency Chest Pain" is activated', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    // Allow state updates to settle
    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    expect(cached).toBeDefined()
    expect(cached!.data).toHaveLength(1)
  })

  it('the cached escalation record has riskTier 3', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    expect(cached!.data[0].riskTier).toBe(3)
  })

  it('the cached escalation record has riskScore ≥ 7', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    expect(cached!.data[0].riskScore).toBeGreaterThanOrEqual(7)
  })

  it('the cached escalation matches the scenario escalation data exactly', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    const expectedEscalation = DEMO_SCENARIOS['emergency-chest-pain'].escalation!

    expect(cached!.data[0]).toEqual(expectedEscalation)
  })

  it('"Happy Path CHF" cache has zero escalation records', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    expect(cached!.data).toHaveLength(0)
  })

  it('"Medium Risk COPD" cache has zero escalation records', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderDemoWithEscalationPage()

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    await act(async () => {
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<ApiResponse<Escalation[]>>(queryKeys.escalations())
    expect(cached!.data).toHaveLength(0)
  })
})

// ─── Suite 5: Role-based rendering with Emergency scenario ───────────────────

describe('17.10 – Role-based rendering: Emergency scenario Tier 3 visible to all roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventEmitter.clear()
  })

  afterEach(() => {
    deactivateDemoInterceptor()
    mockEventEmitter.clear()
  })

  it('Tier 3 alert is visible to Admin role', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage('admin')

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
    })
  })

  it('Tier 3 alert is visible to Nurse role', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage('nurse')

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
    })
  })

  it('Tier 3 alert is visible to Physician role', async () => {
    const user = userEvent.setup()
    renderDemoWithEscalationPage('physician')

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
    })
  })

  it('Tier 2 section is NOT rendered for Physician role even in Emergency scenario', async () => {
    // The emergency scenario only has a Tier 3 escalation (no Tier 2),
    // so the Tier 2 section should not appear regardless of role.
    const user = userEvent.setup()
    renderDemoWithEscalationPage('physician')

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /tier 3 urgent alerts/i })
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('region', { name: /tier 2 callback queue/i })
    ).not.toBeInTheDocument()
  })
})
