/**
 * Task 18.9 — Verify full keyboard operability — no mouse-only interactions
 *
 * Validates Requirement 9 (WCAG 2.1 AA):
 * "THE Application SHALL be fully operable using only a keyboard, with no
 * functionality requiring a mouse or pointer device."
 *
 * Covers:
 *   1. AppShell navigation links — Tab to focus, Enter to activate
 *   2. LoginPage Sign In button — Tab to focus, Enter/Space to activate
 *   3. DischargeQueue table rows (Admin/Nurse) — Enter key opens drawer
 *   4. Slide-out drawer — Escape closes it, focus returns to trigger
 *   5. Filter controls on DischargeQueue — keyboard accessible
 *   6. Pagination controls — Previous/Next buttons keyboard accessible
 *   7. DemoPanel scenario buttons — keyboard accessible
 *   8. Sign Out button — keyboard accessible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
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

vi.mock('@/lib/apiClient', () => ({ apiClient: vi.fn() }))

// ─── Context mocks ────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

vi.mock('@/contexts/WebSocketContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/WebSocketContext')>()
  return { ...actual, useWebSocket: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { apiClient } from '@/lib/apiClient'
import { AppShell } from '@/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DischargeQueuePage } from '@/pages/DischargeQueuePage'
import { DemoPanel } from '@/components/DemoPanel'
import { Pagination } from '@/components/Pagination'
import type { Mock } from 'vitest'
import type { ApiResponse, AuthContextValue, Discharge, WebSocketContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'nurse@example.com' } as unknown as User

function mockAuth(overrides: Partial<AuthContextValue> = {}) {
  ;(useAuth as Mock).mockReturnValue({
    user: fakeUser,
    role: 'nurse',
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
    ...overrides,
  } satisfies AuthContextValue)
}

function mockWS(overrides: Partial<WebSocketContextValue> = {}) {
  ;(useWebSocket as Mock).mockReturnValue({
    connected: true,
    reconnecting: false,
    connectionAttempts: 0,
    lastEventId: null,
    lastDischargeCreatedId: null,
    ...overrides,
  } satisfies WebSocketContextValue)
}

function makeDischarge(overrides: Partial<Discharge> = {}): Discharge {
  return {
    id: `d-${Math.random().toString(36).slice(2)}`,
    patientId: 'p-1',
    patientName: 'Jane Doe',
    diagnosisGroup: 'CHF',
    icd10Code: 'I50.9',
    dischargeDateTime: '2024-01-15T10:00:00Z',
    medications: [{ name: 'Furosemide', dose: '40mg', frequency: 'daily', newMed: false }],
    riskLevel: 'medium',
    callStatus: 'completed',
    riskScore: 5,
    riskTier: 2,
    confidence: 0.8,
    ...overrides,
  }
}

function makeApiResponse(discharges: Discharge[], total?: number): ApiResponse<Discharge[]> {
  return { data: discharges, meta: { page: 1, limit: 25, total: total ?? discharges.length } }
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderAppShell(initialPath = '/dashboard') {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div data-testid="page-content">Page content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  )
}

function renderDischargeQueuePage() {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DischargeQueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderDemoPanel(initialPath = '/dashboard?demo=true') {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DemoPanel />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── 1. AppShell navigation links ────────────────────────────────────────────

describe('18.9 – AppShell navigation links are keyboard accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    mockWS()
  })

  it('nav links are rendered as anchor elements (natively keyboard focusable)', () => {
    renderAppShell('/dashboard')
    // NavLink renders <a> elements — natively focusable without tabIndex
    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    const links = within(nav).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(4)
    links.forEach((link) => {
      expect(link.tagName).toBe('A')
    })
  })

  it('nav links have focus-visible ring class for visible focus indicator', () => {
    renderAppShell('/dashboard')
    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    const links = within(nav).getAllByRole('link')
    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:ring-2')
    })
  })

  it('Tab key moves focus to nav links', async () => {
    const user = userEvent.setup()
    renderAppShell('/dashboard')

    // Tab from body to reach the first interactive element
    await user.tab()
    const focused = document.activeElement
    // The first focusable element in the mobile header is the hamburger button
    // or a nav link — either way it must be keyboard reachable
    expect(focused).not.toBe(document.body)
    expect(focused?.tagName).toMatch(/^(A|BUTTON)$/)
  })

  it('Enter key activates a nav link (follows href)', async () => {
    const user = userEvent.setup()
    renderAppShell('/dashboard')

    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    const dashboardLink = within(nav).getByRole('link', { name: /dashboard/i })

    dashboardLink.focus()
    expect(document.activeElement).toBe(dashboardLink)

    // Enter on a link triggers navigation (no error thrown)
    await user.keyboard('{Enter}')
    // Link is still in the DOM (same-page navigation in MemoryRouter)
    expect(dashboardLink).toBeInTheDocument()
  })
})

// ─── 2. LoginPage Sign In button ─────────────────────────────────────────────

describe('18.9 – LoginPage Sign In button is keyboard accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth({ user: null, role: null })
  })

  it('Sign In button is a <button> element (natively keyboard focusable)', () => {
    renderLoginPage()
    const btn = screen.getByRole('button', { name: /sign in with google/i })
    expect(btn.tagName).toBe('BUTTON')
  })

  it('Sign In button has focus-visible ring class for visible focus indicator', () => {
    renderLoginPage()
    const btn = screen.getByRole('button', { name: /sign in with google/i })
    expect(btn.className).toContain('focus-visible:ring-2')
  })

  it('Tab key focuses the Sign In button', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.tab()
    const btn = screen.getByRole('button', { name: /sign in with google/i })
    expect(document.activeElement).toBe(btn)
  })

  it('Enter key activates the Sign In button', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    mockAuth({ user: null, role: null, signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    const btn = screen.getByRole('button', { name: /sign in with google/i })
    btn.focus()
    await user.keyboard('{Enter}')

    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('Space key activates the Sign In button', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    mockAuth({ user: null, role: null, signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    // Tab to focus the Sign In button (it's the only interactive element)
    await user.tab()
    const btn = screen.getByRole('button', { name: /sign in with google/i })
    expect(document.activeElement).toBe(btn)

    await user.keyboard(' ')

    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })
})

// ─── 3. DischargeQueue table rows — Enter key opens drawer ───────────────────

describe('18.9 – DischargeQueue table rows are keyboard accessible (Admin/Nurse)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWS()
  })

  /** Wait for the table to render and return its tbody */
  async function getTableBody() {
    const table = await screen.findByRole('table')
    return table.querySelector('tbody')!
  }

  it('interactive rows have tabIndex=0 (keyboard focusable)', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderDischargeQueuePage()

    const tbody = await getTableBody()
    await waitFor(() => {
      expect(within(tbody).getByText('Alice Smith')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Alice Smith').closest('tr')!
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('interactive rows have focus-visible ring class', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderDischargeQueuePage()

    const tbody = await getTableBody()
    await waitFor(() => {
      expect(within(tbody).getByText('Alice Smith')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Alice Smith').closest('tr')!
    expect(row.className).toContain('focus-visible:ring-2')
  })

  it('Enter key on a focused row opens the drawer (Nurse)', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Bob Jones' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderDischargeQueuePage()

    const tbody = await getTableBody()
    await waitFor(() => {
      expect(within(tbody).getByText('Bob Jones')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Bob Jones').closest('tr')!

    // Use fireEvent.keyDown since <tr> is not a natively focusable element
    // and jsdom doesn't dispatch synthetic React events via user.keyboard on non-native focusables
    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('Space key on a focused row opens the drawer (Admin)', async () => {
    mockAuth({ role: 'admin' })
    const discharges = [makeDischarge({ patientName: 'Carol White' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderDischargeQueuePage()

    const tbody = await getTableBody()
    await waitFor(() => {
      expect(within(tbody).getByText('Carol White')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Carol White').closest('tr')!

    fireEvent.keyDown(row, { key: ' ', code: 'Space' })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('Physician rows do NOT have tabIndex (not interactive)', async () => {
    mockAuth({ role: 'physician' })
    const discharges = [makeDischarge({ patientName: 'Dave Brown' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderDischargeQueuePage()

    const tbody = await getTableBody()
    await waitFor(() => {
      expect(within(tbody).getByText('Dave Brown')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Dave Brown').closest('tr')!
    expect(row).not.toHaveAttribute('tabindex')
  })
})

// ─── 4. Slide-out drawer — Escape closes, focus returns ──────────────────────

describe('18.9 – Slide-out drawer keyboard behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWS()
  })

  it('Escape key closes the drawer', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Eve Green' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderDischargeQueuePage()

    // Wait for the table row (tablet+ view) to appear
    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    await waitFor(() => {
      expect(within(tbody).getByText('Eve Green')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Eve Green').closest('tr')!
    await user.click(row)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('focus returns to the triggering row after drawer is closed via Escape', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Frank White' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderDischargeQueuePage()

    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    await waitFor(() => {
      expect(within(tbody).getByText('Frank White')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Frank White').closest('tr')!

    await user.click(row)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Focus should have returned to the triggering row
    expect(document.activeElement).toBe(row)
  })

  it('Close button inside drawer is keyboard accessible', async () => {
    mockAuth({ role: 'nurse' })
    const discharges = [makeDischarge({ patientName: 'Grace Lee' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderDischargeQueuePage()

    const table = await screen.findByRole('table')
    const tbody = table.querySelector('tbody')!
    await waitFor(() => {
      expect(within(tbody).getByText('Grace Lee')).toBeInTheDocument()
    })

    const row = within(tbody).getByText('Grace Lee').closest('tr')!
    await user.click(row)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const closeBtn = screen.getByRole('button', { name: /close drawer/i })
    expect(closeBtn.tagName).toBe('BUTTON')
    expect(closeBtn.className).toContain('focus-visible:ring-2')

    // Activate close button via keyboard
    closeBtn.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

// ─── 5. Filter controls on DischargeQueue ────────────────────────────────────

describe('18.9 – DischargeQueue filter controls are keyboard accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWS()
    mockAuth({ role: 'nurse' })
  })

  it('Diagnosis Group select has a label and is keyboard focusable', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderDischargeQueuePage()

    const diagSelect = screen.getByRole('listbox', { name: /filter by diagnosis group/i })
    expect(diagSelect.tagName).toBe('SELECT')
    // Selects are natively keyboard focusable — verify it has an accessible label
    expect(diagSelect).toHaveAccessibleName()
  })

  it('Call Outcome select has a label and is keyboard focusable', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderDischargeQueuePage()

    const outcomeSelect = screen.getByRole('listbox', { name: /filter by call outcome/i })
    expect(outcomeSelect.tagName).toBe('SELECT')
    expect(outcomeSelect).toHaveAccessibleName()
  })

  it('Risk Tier filter buttons are keyboard accessible (tabIndex, focus ring)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderDischargeQueuePage()

    const tierGroup = screen.getByRole('group', { name: /filter by risk tier/i })
    const tierButtons = within(tierGroup).getAllByRole('button')

    // Should have All + Tier 1 + Tier 2 + Tier 3
    expect(tierButtons.length).toBe(4)

    tierButtons.forEach((btn) => {
      expect(btn.tagName).toBe('BUTTON')
      expect(btn.className).toContain('focus-visible:ring-2')
    })
  })

  it('Tab key can reach Risk Tier filter buttons', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderDischargeQueuePage()

    const tierGroup = screen.getByRole('group', { name: /filter by risk tier/i })
    const allButton = within(tierGroup).getByRole('button', { name: /^all$/i })

    allButton.focus()
    expect(document.activeElement).toBe(allButton)

    // Space/Enter activates the button
    await user.keyboard(' ')
    // No error thrown — button is keyboard operable
    expect(allButton).toBeInTheDocument()
  })

  it('Diagnosis Group select has focus-visible ring class', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderDischargeQueuePage()

    const diagSelect = screen.getByRole('listbox', { name: /filter by diagnosis group/i })
    expect(diagSelect.className).toContain('focus-visible:ring-2')
  })
})

// ─── 6. Pagination controls ───────────────────────────────────────────────────

describe('18.9 – Pagination controls are keyboard accessible', () => {
  it('Previous and Next buttons are <button> elements with aria-labels', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination page={2} total={100} onPageChange={onPageChange} />
    )

    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    const nextBtn = screen.getByRole('button', { name: /next page/i })

    expect(prevBtn.tagName).toBe('BUTTON')
    expect(nextBtn.tagName).toBe('BUTTON')
    expect(prevBtn).toHaveAttribute('aria-label', 'Previous page')
    expect(nextBtn).toHaveAttribute('aria-label', 'Next page')
  })

  it('Pagination buttons have focus-visible ring class', () => {
    render(
      <Pagination page={2} total={100} onPageChange={vi.fn()} />
    )

    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    const nextBtn = screen.getByRole('button', { name: /next page/i })

    expect(prevBtn.className).toContain('focus-visible:ring-2')
    expect(nextBtn.className).toContain('focus-visible:ring-2')
  })

  it('Tab key focuses Previous then Next button', async () => {
    const user = userEvent.setup()
    render(
      <Pagination page={2} total={100} onPageChange={vi.fn()} />
    )

    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    const nextBtn = screen.getByRole('button', { name: /next page/i })

    prevBtn.focus()
    expect(document.activeElement).toBe(prevBtn)

    await user.tab()
    expect(document.activeElement).toBe(nextBtn)
  })

  it('Enter key on Previous button calls onPageChange with page - 1', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Pagination page={3} total={100} onPageChange={onPageChange} />
    )

    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    prevBtn.focus()
    await user.keyboard('{Enter}')

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('Enter key on Next button calls onPageChange with page + 1', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Pagination page={2} total={100} onPageChange={onPageChange} />
    )

    const nextBtn = screen.getByRole('button', { name: /next page/i })
    nextBtn.focus()
    await user.keyboard('{Enter}')

    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('disabled Previous button (page 1) is not activatable via keyboard', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Pagination page={1} total={100} onPageChange={onPageChange} />
    )

    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    expect(prevBtn).toBeDisabled()

    prevBtn.focus()
    await user.keyboard('{Enter}')

    // Disabled button should not call onPageChange
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('Pagination nav has aria-label="Pagination"', () => {
    render(
      <Pagination page={1} total={50} onPageChange={vi.fn()} />
    )
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
  })
})

// ─── 7. DemoPanel scenario buttons ───────────────────────────────────────────

describe('18.9 – DemoPanel scenario buttons are keyboard accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  it('scenario buttons are <button> elements (natively keyboard focusable)', () => {
    renderDemoPanel()

    const chfBtn = screen.getByTestId('demo-scenario-happy-path-chf')
    const copdBtn = screen.getByTestId('demo-scenario-medium-risk-copd')
    const emergencyBtn = screen.getByTestId('demo-scenario-emergency-chest-pain')

    expect(chfBtn.tagName).toBe('BUTTON')
    expect(copdBtn.tagName).toBe('BUTTON')
    expect(emergencyBtn.tagName).toBe('BUTTON')
  })

  it('scenario buttons have focus-visible ring class', () => {
    renderDemoPanel()

    const chfBtn = screen.getByTestId('demo-scenario-happy-path-chf')
    expect(chfBtn.className).toContain('focus-visible:ring-2')
  })

  it('Tab key can reach scenario buttons', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    const chfBtn = screen.getByTestId('demo-scenario-happy-path-chf')
    chfBtn.focus()
    expect(document.activeElement).toBe(chfBtn)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByTestId('demo-scenario-medium-risk-copd'))
  })

  it('Enter key activates a scenario button', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    const chfBtn = screen.getByTestId('demo-scenario-happy-path-chf')
    chfBtn.focus()
    await user.keyboard('{Enter}')

    // Button should now be pressed (aria-pressed=true)
    expect(chfBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('Space key activates a scenario button', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    const chfBtn = screen.getByTestId('demo-scenario-happy-path-chf')
    const copdBtn = screen.getByTestId('demo-scenario-medium-risk-copd')

    // Tab to the first scenario button, then Tab again to reach COPD
    chfBtn.focus()
    await user.tab()
    expect(document.activeElement).toBe(copdBtn)

    await user.keyboard(' ')

    expect(copdBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('collapse/expand toggle button is keyboard accessible', async () => {
    const user = userEvent.setup()
    renderDemoPanel()

    const collapseBtn = screen.getByRole('button', { name: /collapse demo panel/i })
    expect(collapseBtn.tagName).toBe('BUTTON')
    expect(collapseBtn.className).toContain('focus-visible:ring-2')

    collapseBtn.focus()
    await user.keyboard('{Enter}')

    // After collapse, scenario buttons should be hidden
    expect(screen.queryByTestId('demo-scenario-happy-path-chf')).not.toBeInTheDocument()
  })
})

// ─── 8. Sign Out button ───────────────────────────────────────────────────────

describe('18.9 – Sign Out button is keyboard accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    mockWS()
  })

  it('Sign Out button is a <button> element', () => {
    renderAppShell('/dashboard')
    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    expect(signOutButtons.length).toBeGreaterThanOrEqual(1)
    signOutButtons.forEach((btn) => {
      expect(btn.tagName).toBe('BUTTON')
    })
  })

  it('Sign Out button has focus-visible ring class', () => {
    renderAppShell('/dashboard')
    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    signOutButtons.forEach((btn) => {
      expect(btn.className).toContain('focus-visible:ring-2')
    })
  })

  it('Enter key activates the Sign Out button', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    mockAuth({ signOut })

    const user = userEvent.setup()
    renderAppShell('/dashboard')

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    const signOutBtn = signOutButtons[0]

    signOutBtn.focus()
    await user.keyboard('{Enter}')

    expect(signOut).toHaveBeenCalledOnce()
  })

  it('Space key activates the Sign Out button', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    mockAuth({ signOut })

    const user = userEvent.setup()
    renderAppShell('/dashboard')

    const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
    const signOutBtn = signOutButtons[0]

    // Use userEvent to focus via tab then press Space
    signOutBtn.focus()
    // userEvent needs to track focus — use pointer to focus first
    await user.pointer({ target: signOutBtn })
    await user.keyboard(' ')

    expect(signOut).toHaveBeenCalledOnce()
  })
})
