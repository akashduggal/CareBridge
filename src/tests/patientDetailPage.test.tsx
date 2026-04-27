/**
 * Tests for PatientDetailPage (task 15.9)
 *
 * 15.9 – Navigate to patient detail view on row click (showing full discharge history)
 *   - Renders patient name and date of birth
 *   - Renders discharge history table with columns: Discharge Date, Diagnosis Group, Risk Tier, Call Outcome
 *   - Shows loading skeleton while fetching
 *   - Shows empty state when no discharge history
 *   - Shows error banner on fetch failure
 *   - Shows 404 state when patient not found
 *   - Back link navigates to /patients
 *   - PatientListPage rows navigate to /patients/:id on click
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

vi.mock('@/lib/apiClient', () => ({ apiClient: vi.fn() }))

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
import { PatientDetailPage } from '@/pages/PatientDetailPage'
import { PatientListPage } from '@/pages/PatientListPage'
import type { Mock } from 'vitest'
import type {
  ApiResponse,
  AuthContextValue,
  Discharge,
  DiagnosisGroup,
  Patient,
  RiskTier,
  WebSocketContextValue,
} from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1' } as unknown as User

function mockAuth(role: AuthContextValue['role'] = 'nurse') {
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

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p-abc123',
    name: 'Jane Doe',
    dateOfBirth: '1980-03-15',
    lastDischargeDate: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function makeDischarge(overrides: Partial<Discharge> = {}): Discharge {
  return {
    id: `d-${Math.random().toString(36).slice(2)}`,
    patientId: 'p-abc123',
    patientName: 'Jane Doe',
    diagnosisGroup: 'CHF' as DiagnosisGroup,
    icd10Code: 'I50.9',
    dischargeDateTime: '2024-01-15T10:00:00Z',
    medications: [],
    riskLevel: 'medium',
    callStatus: 'completed',
    riskScore: 5,
    riskTier: 2 as RiskTier,
    confidence: 0.8,
    ...overrides,
  }
}

function makeDischargesResponse(discharges: Discharge[]): ApiResponse<Discharge[]> {
  return { data: discharges, meta: { total: discharges.length } }
}

/** Render PatientDetailPage at /patients/:id */
function renderDetailPage(patientId = 'p-abc123') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/patients/${patientId}`]}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/patients" element={<div>Patient List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Render PatientListPage with routing so navigation can be tested */
function renderListPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients']}>
        <Routes>
          <Route path="/patients" element={<PatientListPage />} />
          <Route path="/patients/:id" element={<div data-testid="detail-page">Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth()
  mockWS()
})

// ─── Patient info header ──────────────────────────────────────────────────────

describe('15.9 – Patient detail: patient info header', () => {
  it('renders patient name and date of birth', async () => {
    const patient = makePatient({ name: 'Jane Doe', dateOfBirth: '1980-03-15' })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(patient)
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })
    expect(screen.getByText('Mar 15, 1980')).toBeInTheDocument()
  })

  it('renders last discharge date when available', async () => {
    const patient = makePatient({ lastDischargeDate: '2024-01-15T10:00:00Z' })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(patient)
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
  })

  it('does not render last discharge label when absent', async () => {
    const patient = makePatient({ lastDischargeDate: undefined })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(patient)
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })
    expect(screen.queryByText('Last Discharge:')).not.toBeInTheDocument()
  })
})

// ─── Discharge history table ──────────────────────────────────────────────────

describe('15.9 – Patient detail: discharge history table', () => {
  it('renders table with correct column headers', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const headers = table.querySelectorAll('th[scope="col"]')
    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('Discharge Date')
    expect(headerTexts).toContain('Diagnosis Group')
    expect(headerTexts).toContain('Risk Tier')
    expect(headerTexts).toContain('Call Outcome')
  })

  it('renders discharge rows with correct data', async () => {
    const discharge = makeDischarge({
      diagnosisGroup: 'CHF',
      dischargeDateTime: '2024-01-15T10:00:00Z',
      riskTier: 2,
      riskScore: 5,
      callStatus: 'completed',
    })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([discharge]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('CHF')).toBeInTheDocument()
    })

    // Discharge date formatted (use getAllByText since header also shows Jan 15, 2024)
    const dateMatches = screen.getAllByText(/Jan 15, 2024/)
    expect(dateMatches.length).toBeGreaterThanOrEqual(1)
    // Risk tier badge
    expect(screen.getByText('Tier 2')).toBeInTheDocument()
    // Call status
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders multiple discharge rows', async () => {
    const discharges = [
      makeDischarge({ diagnosisGroup: 'CHF', dischargeDateTime: '2024-01-15T10:00:00Z' }),
      makeDischarge({ diagnosisGroup: 'COPD', dischargeDateTime: '2023-06-20T08:00:00Z' }),
    ]
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse(discharges))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('CHF')).toBeInTheDocument()
      expect(screen.getByText('COPD')).toBeInTheDocument()
    })
  })

  it('shows dash when riskTier is absent', async () => {
    const discharge = makeDischarge({ riskTier: undefined, riskScore: undefined })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([discharge]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('CHF')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(within(tbody).getByText('—')).toBeInTheDocument()
  })

  it('renders pending call status', async () => {
    const discharge = makeDischarge({ callStatus: 'pending' })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([discharge]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('renders in_progress call status', async () => {
    const discharge = makeDischarge({ callStatus: 'in_progress' })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([discharge]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })
  })

  it('renders failed call status', async () => {
    const discharge = makeDischarge({ callStatus: 'failed' })
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([discharge]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })
})

// ─── Loading state ────────────────────────────────────────────────────────────

describe('15.9 – Patient detail: loading skeleton', () => {
  it('renders skeleton rows while fetching', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderDetailPage()

    const table = screen.getByRole('table')
    const tbody = table.querySelector('tbody')!
    const loadingRows = within(tbody).getAllByRole('row', { name: /loading row/i })
    expect(loadingRows.length).toBeGreaterThan(0)
    loadingRows.forEach((row) => {
      expect(row).toHaveAttribute('aria-busy', 'true')
    })
  })

  it('replaces skeleton rows with data after fetch completes', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([makeDischarge()]))

    renderDetailPage()

    const table = screen.getByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(within(tbody).getAllByRole('row', { name: /loading row/i }).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(within(tbody).queryAllByRole('row', { name: /loading row/i })).toHaveLength(0)
    })
  })
})

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('15.9 – Patient detail: empty state', () => {
  it('shows "No discharge history found." when no discharges', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('No discharge history found.')).toBeInTheDocument()
    })
  })
})

// ─── Error state ──────────────────────────────────────────────────────────────

describe('15.9 – Patient detail: error states', () => {
  it('shows error banner when discharge history fetch fails', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockRejectedValueOnce(new Error('Network error'))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load discharge history.')
  })

  it('shows error banner when patient info fetch fails (non-404)', async () => {
    ;(apiClient as Mock)
      .mockRejectedValueOnce(new Error('API error: 500'))
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load patient information.')
  })

  it('shows 404 state when patient not found', async () => {
    ;(apiClient as Mock)
      .mockRejectedValueOnce(new Error('API error: 404'))
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Patient not found')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /back to patient list/i })).toBeInTheDocument()
  })
})

// ─── Back link ────────────────────────────────────────────────────────────────

describe('15.9 – Patient detail: back link', () => {
  it('renders a back link to /patients', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to patient list/i })).toBeInTheDocument()
    })

    const backLink = screen.getByRole('link', { name: /back to patient list/i })
    expect(backLink).toHaveAttribute('href', '/patients')
  })

  it('clicking back link navigates to /patients', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([]))

    const user = userEvent.setup()
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to patient list/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: /back to patient list/i }))

    await waitFor(() => {
      expect(screen.getByText('Patient List')).toBeInTheDocument()
    })
  })
})

// ─── Row click navigation from PatientListPage ────────────────────────────────

describe('15.9 – PatientListPage row click navigates to /patients/:id', () => {
  it('clicking a patient row navigates to the detail page', async () => {
    const patient = makePatient({ id: 'p-abc123', name: 'Jane Doe' })
    ;(apiClient as Mock).mockResolvedValue({
      data: [patient],
      meta: { page: 1, limit: 25, total: 1 },
    })

    const user = userEvent.setup()
    renderListPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    const row = screen.getByText('Jane Doe').closest('tr')!
    await user.click(row)

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument()
    })
  })

  it('pressing Enter on a patient row navigates to the detail page', async () => {
    const patient = makePatient({ id: 'p-abc123', name: 'Jane Doe' })
    ;(apiClient as Mock).mockResolvedValue({
      data: [patient],
      meta: { page: 1, limit: 25, total: 1 },
    })

    const user = userEvent.setup()
    renderListPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    const row = screen.getByText('Jane Doe').closest('tr')!
    row.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument()
    })
  })

  it('pressing Space on a patient row navigates to the detail page', async () => {
    const patient = makePatient({ id: 'p-abc123', name: 'Jane Doe' })
    ;(apiClient as Mock).mockResolvedValue({
      data: [patient],
      meta: { page: 1, limit: 25, total: 1 },
    })

    const user = userEvent.setup()
    renderListPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    const row = screen.getByText('Jane Doe').closest('tr')!
    row.focus()
    await user.keyboard(' ')

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument()
    })
  })
})

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('15.9 – Patient detail: accessibility', () => {
  it('discharge history section has an accessible heading', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /discharge history/i })).toBeInTheDocument()
    })
  })

  it('table has th elements with scope="col"', async () => {
    ;(apiClient as Mock)
      .mockResolvedValueOnce(makePatient())
      .mockResolvedValueOnce(makeDischargesResponse([makeDischarge()]))

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const headers = table.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(4)
  })
})
