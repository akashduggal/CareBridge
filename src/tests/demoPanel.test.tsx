/**
 * Tests for DemoPanel component (task 17.1)
 *
 * 17.1 – DemoPanel floating component:
 *   - Not rendered when ?demo=true is absent (Requirement 8.3)
 *   - Rendered when ?demo=true is present AND user is authenticated (Requirement 8.1)
 *   - Not rendered when ?demo=true is present but user is NOT authenticated (Requirement 8.1)
 *   - Displays three scenario buttons (Requirement 8.4)
 *   - Active scenario button is highlighted after click (Requirement 8.9)
 *
 * 17.8 – Component test: DemoPanel not rendered when ?demo=true absent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
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

/**
 * Render DemoPanel inside a MemoryRouter so useSearchParams works,
 * and inside a QueryClientProvider so useQueryClient works.
 * Pass `initialEntries` to control the URL.
 */
function renderDemoPanel(initialPath = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DemoPanel />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── 17.8 / 17.1: Not rendered when ?demo=true is absent ─────────────────────

describe('17.8 – DemoPanel not rendered when ?demo=true is absent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  it('is not in the DOM when URL has no query params', () => {
    renderDemoPanel('/dashboard')
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })

  it('is not in the DOM when URL has ?demo=false', () => {
    renderDemoPanel('/dashboard?demo=false')
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })

  it('is not in the DOM when URL has an unrelated query param', () => {
    renderDemoPanel('/dashboard?foo=bar')
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })

  it('is not in the DOM when URL has ?demo=1 (not exactly "true")', () => {
    renderDemoPanel('/dashboard?demo=1')
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })
})

// ─── 17.1: Rendered when ?demo=true AND authenticated ────────────────────────

describe('17.1 – DemoPanel rendered when ?demo=true and authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  it('renders the panel when ?demo=true and user is authenticated', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.getByTestId('demo-panel')).toBeInTheDocument()
  })

  it('shows "Demo Mode" label in the panel header', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.getByText(/demo mode/i)).toBeInTheDocument()
  })

  it('renders all three scenario buttons', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.getByTestId('demo-scenario-happy-path-chf')).toBeInTheDocument()
    expect(screen.getByTestId('demo-scenario-medium-risk-copd')).toBeInTheDocument()
    expect(screen.getByTestId('demo-scenario-emergency-chest-pain')).toBeInTheDocument()
  })

  it('scenario buttons have correct labels', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.getByText('Happy Path CHF')).toBeInTheDocument()
    expect(screen.getByText('Medium Risk COPD')).toBeInTheDocument()
    expect(screen.getByText('Emergency Chest Pain')).toBeInTheDocument()
  })
})

// ─── 17.1: Not rendered when ?demo=true but NOT authenticated ────────────────

describe('17.1 – DemoPanel not rendered when ?demo=true but unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(null) // unauthenticated
  })

  it('is not in the DOM when user is null even with ?demo=true', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.queryByTestId('demo-panel')).not.toBeInTheDocument()
  })
})

// ─── 17.1: Active scenario button highlighted after click ────────────────────

describe('17.1 – Active scenario button is highlighted after click', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  it('no scenario is active initially (no aria-pressed=true)', () => {
    renderDemoPanel('/dashboard?demo=true')
    const buttons = screen.getAllByRole('button', { name: /happy path|medium risk|emergency/i })
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('clicking "Happy Path CHF" sets it as active (aria-pressed=true)', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const chfButton = screen.getByTestId('demo-scenario-happy-path-chf')
    await user.click(chfButton)

    expect(chfButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking "Medium Risk COPD" sets it as active', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const copdButton = screen.getByTestId('demo-scenario-medium-risk-copd')
    await user.click(copdButton)

    expect(copdButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking "Emergency Chest Pain" sets it as active', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const emergencyButton = screen.getByTestId('demo-scenario-emergency-chest-pain')
    await user.click(emergencyButton)

    expect(emergencyButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('only one scenario is active at a time — switching deactivates the previous', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const chfButton = screen.getByTestId('demo-scenario-happy-path-chf')
    const copdButton = screen.getByTestId('demo-scenario-medium-risk-copd')

    // Activate CHF first
    await user.click(chfButton)
    expect(chfButton).toHaveAttribute('aria-pressed', 'true')
    expect(copdButton).toHaveAttribute('aria-pressed', 'false')

    // Switch to COPD
    await user.click(copdButton)
    expect(copdButton).toHaveAttribute('aria-pressed', 'true')
    expect(chfButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('active scenario button has distinct visual highlight class', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const emergencyButton = screen.getByTestId('demo-scenario-emergency-chest-pain')
    await user.click(emergencyButton)

    // Active button should have the ring/highlight class
    expect(emergencyButton.className).toContain('ring-2')
  })

  it('calls onScenarioActivate callback with the correct scenario id', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <DemoPanel onScenarioActivate={onActivate} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    expect(onActivate).toHaveBeenCalledOnce()
    expect(onActivate).toHaveBeenCalledWith('emergency-chest-pain')
  })
})

// ─── 17.1: Collapse/expand toggle ────────────────────────────────────────────

describe('17.1 – DemoPanel collapse/expand toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  it('scenario buttons are visible by default (not collapsed)', () => {
    renderDemoPanel('/dashboard?demo=true')
    expect(screen.getByTestId('demo-scenario-happy-path-chf')).toBeInTheDocument()
  })

  it('clicking collapse button hides scenario buttons', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const collapseBtn = screen.getByRole('button', { name: /collapse demo panel/i })
    await user.click(collapseBtn)

    expect(screen.queryByTestId('demo-scenario-happy-path-chf')).not.toBeInTheDocument()
  })

  it('clicking expand button after collapse shows scenario buttons again', async () => {
    const user = userEvent.setup()
    renderDemoPanel('/dashboard?demo=true')

    const collapseBtn = screen.getByRole('button', { name: /collapse demo panel/i })
    await user.click(collapseBtn)

    const expandBtn = screen.getByRole('button', { name: /expand demo panel/i })
    await user.click(expandBtn)

    expect(screen.getByTestId('demo-scenario-happy-path-chf')).toBeInTheDocument()
  })
})

// ─── 17.4: Cache override on scenario button click ───────────────────────────

describe('17.4 – Cache override on scenario button click', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
  })

  it('clicking "Happy Path CHF" sets dashboard stats in the query cache', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <DemoPanel />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))

    const { queryKeys } = await import('@/lib/queryKeys')
    const { DEMO_SCENARIOS } = await import('@/mocks/demoScenarios')

    const cachedStats = queryClient.getQueryData(queryKeys.dashboard())
    expect(cachedStats).toEqual(DEMO_SCENARIOS['happy-path-chf'].stats)
  })

  it('clicking "Emergency Chest Pain" sets escalations in the query cache', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <DemoPanel />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))

    const { queryKeys } = await import('@/lib/queryKeys')
    const { DEMO_SCENARIOS } = await import('@/mocks/demoScenarios')

    const cachedEscalations = queryClient.getQueryData(queryKeys.escalations())
    expect(cachedEscalations).toEqual(DEMO_SCENARIOS['emergency-chest-pain'].escalations)
  })

  it('clicking "Medium Risk COPD" sets discharges list in the query cache', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <DemoPanel />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(screen.getByTestId('demo-scenario-medium-risk-copd'))

    const { queryKeys } = await import('@/lib/queryKeys')
    const { DEMO_SCENARIOS } = await import('@/mocks/demoScenarios')

    const cachedDischarges = queryClient.getQueryData(queryKeys.discharges())
    expect(cachedDischarges).toEqual(DEMO_SCENARIOS['medium-risk-copd'].discharges)
  })

  it('switching scenarios updates the cache to the new scenario data', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard?demo=true']}>
          <DemoPanel />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const { queryKeys } = await import('@/lib/queryKeys')
    const { DEMO_SCENARIOS } = await import('@/mocks/demoScenarios')

    // Activate CHF first
    await user.click(screen.getByTestId('demo-scenario-happy-path-chf'))
    expect(queryClient.getQueryData(queryKeys.dashboard())).toEqual(
      DEMO_SCENARIOS['happy-path-chf'].stats
    )

    // Switch to Emergency — cache should update
    await user.click(screen.getByTestId('demo-scenario-emergency-chest-pain'))
    expect(queryClient.getQueryData(queryKeys.dashboard())).toEqual(
      DEMO_SCENARIOS['emergency-chest-pain'].stats
    )
  })
})
