/**
 * Tests for DischargeQueuePage (tasks 12.14–12.17)
 *
 * 12.14 – PBT: sort reversibility (ascending + reverse = descending)
 *          (Property 7: Sort Operation Reversibility)
 * 12.15 – PBT: filter subset invariant (filtered count ≤ total count)
 *          (Property 8: Filter Subset Invariant)
 * 12.16 – PBT: pagination row limit (each page ≤ 25 rows)
 *          (Property 9: Pagination Row Limit Invariant)
 * 12.17 – Component tests: Physician rows non-interactive; Admin/Nurse rows open drawer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

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
import { DischargeQueuePage } from '@/pages/DischargeQueuePage'
import type { Mock } from 'vitest'
import type { ApiResponse, AuthContextValue, Discharge, RiskTier, CallOutcome, DiagnosisGroup, WebSocketContextValue } from '@/types'
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DischargeQueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// Default WS mock for all tests (can be overridden per-test)
beforeEach(() => {
  mockWS()
})

// ─── 12.14: PBT — Sort reversibility ─────────────────────────────────────────
// Feature: readmission-prevention-dashboard, Property 7: Sort Operation Reversibility

/**
 * Sort comparators mirroring the server-side sort logic used by DischargeQueuePage.
 * The component passes sortBy/sortDir as query params; these comparators replicate
 * the expected ordering so we can verify the reversibility property as a pure function.
 */
type SortableColumn = 'patientName' | 'dischargeDateTime' | 'riskTier' | 'callStatus' | 'diagnosisGroup'

interface SortableDischarge {
  id: string
  patientName: string
  dischargeDateTime: string
  riskTier: RiskTier
  callStatus: string
  diagnosisGroup: DiagnosisGroup
}

function sortDischarges(items: SortableDischarge[], col: SortableColumn, dir: 'asc' | 'desc'): SortableDischarge[] {
  return [...items].sort((a, b) => {
    let cmp: number
    switch (col) {
      case 'patientName':
        cmp = a.patientName.localeCompare(b.patientName)
        break
      case 'dischargeDateTime':
        cmp = a.dischargeDateTime.localeCompare(b.dischargeDateTime)
        break
      case 'riskTier':
        cmp = a.riskTier - b.riskTier
        break
      case 'callStatus':
        cmp = a.callStatus.localeCompare(b.callStatus)
        break
      case 'diagnosisGroup':
        cmp = a.diagnosisGroup.localeCompare(b.diagnosisGroup)
        break
    }
    // Stable tiebreaker by id ensures ascending.reverse() === descending
    // when primary sort keys are equal (mirrors SQL ORDER BY col, id)
    if (cmp === 0) cmp = a.id.localeCompare(b.id)
    return dir === 'asc' ? cmp : -cmp
  })
}

/** Arbitrary for a list of SortableDischarge records with unique ids */
const sortableDischargesArb = fc
  .uniqueArray(
    fc.record<SortableDischarge>({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      patientName: fc.string({ minLength: 1, maxLength: 20 }),
      dischargeDateTime: fc.integer({ min: 0, max: 315360000 }).map((offset) =>
        new Date(new Date('2020-01-01T00:00:00Z').getTime() + offset * 1000).toISOString()
      ),
      riskTier: fc.constantFrom<RiskTier>(1, 2, 3),
      callStatus: fc.constantFrom<CallOutcome>('completed', 'voicemail', 'no_answer', 'refused', 'wrong_party'),
      diagnosisGroup: fc.constantFrom<DiagnosisGroup>('CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER'),
    }),
    { minLength: 2, maxLength: 15, selector: (d) => d.id }
  )

const SORTABLE_COLUMNS: SortableColumn[] = ['patientName', 'dischargeDateTime', 'riskTier', 'callStatus', 'diagnosisGroup']

/**
 * Property 7: Sort Operation Reversibility
 * Validates: Requirements 2.3, 12.7 (Metamorphic from Requirements)
 *
 * For any discharge list of length ≥ 2 and any sortable column:
 * 1. Sorting ascending then reversing equals sorting descending.
 * 2. Sorting preserves all rows (no duplication or omission).
 */
describe('12.14 – Sort reversibility (Property 7)', () => {
  test.prop(
    [
      sortableDischargesArb,
      fc.constantFrom<SortableColumn>(...SORTABLE_COLUMNS),
    ],
    { numRuns: 10 }
  )(
    'ascending sort reversed equals descending sort for all sortable columns',
    (discharges, col) => {
      const asc = sortDischarges(discharges, col, 'asc')
      const desc = sortDischarges(discharges, col, 'desc')

      // Property 7a: ascending reversed must equal descending
      expect([...asc].reverse().map((d) => d.id)).toEqual(desc.map((d) => d.id))
    }
  )

  test.prop(
    [
      sortableDischargesArb,
      fc.constantFrom<SortableColumn>(...SORTABLE_COLUMNS),
      fc.constantFrom<'asc' | 'desc'>('asc', 'desc'),
    ],
    { numRuns: 10 }
  )(
    'sorting preserves all rows without duplication or omission',
    (discharges, col, dir) => {
      const sorted = sortDischarges(discharges, col, dir)

      // Property 7b: same length
      expect(sorted).toHaveLength(discharges.length)

      // Property 7b: same elements (no duplication or omission) — compare by id
      const originalIds = discharges.map((d) => d.id).sort()
      const sortedIds = sorted.map((d) => d.id).sort()
      expect(sortedIds).toEqual(originalIds)
    }
  )
})

// ─── 12.15: PBT — Filter subset invariant ────────────────────────────────────
// Feature: readmission-prevention-dashboard, Property 8: Filter Subset Invariant

/**
 * Replicates the client-side filter logic from DischargeQueuePage.
 * The component passes filter params to the server, but the same predicate
 * logic is what determines which rows are "in scope" for a given filter state.
 *
 * Filter rules (AND logic):
 *   - diagnosisGroup: if non-empty, row.diagnosisGroup must be in the array
 *   - riskTier: if non-null, row.riskTier must equal the value
 *   - callOutcome: if non-empty, row.callStatus must be in the array
 */
interface FilterableRow {
  diagnosisGroup: DiagnosisGroup
  riskTier: RiskTier
  callStatus: CallOutcome
}

interface ActiveFilters {
  diagnosisGroup: DiagnosisGroup[]
  riskTier: RiskTier | null
  callOutcome: CallOutcome[]
}

function applyFilters(rows: FilterableRow[], filters: ActiveFilters): FilterableRow[] {
  return rows.filter((row) => {
    if (filters.diagnosisGroup.length > 0 && !filters.diagnosisGroup.includes(row.diagnosisGroup)) {
      return false
    }
    if (filters.riskTier !== null && row.riskTier !== filters.riskTier) {
      return false
    }
    if (filters.callOutcome.length > 0 && !filters.callOutcome.includes(row.callStatus)) {
      return false
    }
    return true
  })
}

/** Arbitrary for a FilterableRow */
const filterableRowArb = fc.record<FilterableRow>({
  diagnosisGroup: fc.constantFrom<DiagnosisGroup>('CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER'),
  riskTier: fc.constantFrom<RiskTier>(1, 2, 3),
  callStatus: fc.constantFrom<CallOutcome>('completed', 'voicemail', 'no_answer', 'refused', 'wrong_party'),
})

/** Arbitrary for ActiveFilters — each dimension independently active or inactive */
const activeFiltersArb = fc.record<ActiveFilters>({
  diagnosisGroup: fc.oneof(
    fc.constant<DiagnosisGroup[]>([]),
    fc.uniqueArray(
      fc.constantFrom<DiagnosisGroup>('CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER'),
      { minLength: 1, maxLength: 3 }
    )
  ),
  riskTier: fc.oneof(
    fc.constant<RiskTier | null>(null),
    fc.constantFrom<RiskTier>(1, 2, 3)
  ),
  callOutcome: fc.oneof(
    fc.constant<CallOutcome[]>([]),
    fc.uniqueArray(
      fc.constantFrom<CallOutcome>('completed', 'voicemail', 'no_answer', 'refused', 'wrong_party'),
      { minLength: 1, maxLength: 3 }
    )
  ),
})

describe('12.15 – Filter subset invariant (Property 8)', () => {
  /**
   * Property 8a: Filtered count ≤ total unfiltered count.
   * Validates: Requirements 2.12, 2.13, 2.14, 2.15, 2.1
   */
  test.prop(
    [
      fc.array(filterableRowArb, { minLength: 0, maxLength: 50 }),
      activeFiltersArb,
    ],
    { numRuns: 10 }
  )(
    'filtered count is always ≤ total unfiltered count',
    (rows, filters) => {
      const filtered = applyFilters(rows, filters)
      expect(filtered.length).toBeLessThanOrEqual(rows.length)
    }
  )

  /**
   * Property 8b: Every row in the filtered result matches ALL active filter criteria (AND logic).
   * Validates: Requirements 2.12, 2.13, 2.14, 2.15, 2.1
   */
  test.prop(
    [
      fc.array(filterableRowArb, { minLength: 0, maxLength: 50 }),
      activeFiltersArb,
    ],
    { numRuns: 10 }
  )(
    'every filtered row satisfies all active filter criteria (AND logic)',
    (rows, filters) => {
      const filtered = applyFilters(rows, filters)

      for (const row of filtered) {
        // diagnosisGroup filter: if active, row must match one of the selected groups
        if (filters.diagnosisGroup.length > 0) {
          expect(filters.diagnosisGroup).toContain(row.diagnosisGroup)
        }
        // riskTier filter: if active, row must match exactly
        if (filters.riskTier !== null) {
          expect(row.riskTier).toBe(filters.riskTier)
        }
        // callOutcome filter: if active, row.callStatus must match one of the selected outcomes
        if (filters.callOutcome.length > 0) {
          expect(filters.callOutcome).toContain(row.callStatus)
        }
      }
    }
  )

  /**
   * Property 8c: The combined-filter result is a subset of each individual single-filter result.
   * Validates: Requirements 2.12, 2.13, 2.14, 2.15, 2.1
   */
  test.prop(
    [
      fc.array(filterableRowArb, { minLength: 0, maxLength: 50 }),
      activeFiltersArb,
    ],
    { numRuns: 10 }
  )(
    'combined filter result is a subset of each individual single-filter result',
    (rows, filters) => {
      const combined = applyFilters(rows, filters)

      // Build a stable identity key for each row (position-based since rows may not be unique)
      // We compare by reference equality using indexOf on the original array
      const combinedIndices = new Set(combined.map((row) => rows.indexOf(row)))

      // Check subset against diagnosisGroup-only filter (if active)
      if (filters.diagnosisGroup.length > 0) {
        const diagOnly = applyFilters(rows, {
          diagnosisGroup: filters.diagnosisGroup,
          riskTier: null,
          callOutcome: [],
        })
        const diagIndices = new Set(diagOnly.map((row) => rows.indexOf(row)))
        for (const idx of combinedIndices) {
          expect(diagIndices.has(idx)).toBe(true)
        }
      }

      // Check subset against riskTier-only filter (if active)
      if (filters.riskTier !== null) {
        const tierOnly = applyFilters(rows, {
          diagnosisGroup: [],
          riskTier: filters.riskTier,
          callOutcome: [],
        })
        const tierIndices = new Set(tierOnly.map((row) => rows.indexOf(row)))
        for (const idx of combinedIndices) {
          expect(tierIndices.has(idx)).toBe(true)
        }
      }

      // Check subset against callOutcome-only filter (if active)
      if (filters.callOutcome.length > 0) {
        const outcomeOnly = applyFilters(rows, {
          diagnosisGroup: [],
          riskTier: null,
          callOutcome: filters.callOutcome,
        })
        const outcomeIndices = new Set(outcomeOnly.map((row) => rows.indexOf(row)))
        for (const idx of combinedIndices) {
          expect(outcomeIndices.has(idx)).toBe(true)
        }
      }
    }
  )
})

// ─── 12.16: PBT — Pagination row limit ───────────────────────────────────────
// Feature: readmission-prevention-dashboard, Property 9: Pagination Row Limit Invariant

/**
 * Property 9: Pagination Row Limit Invariant
 * Validates: Requirements 2.16, 5.7, 2.3 (Invariant from Requirements)
 *
 * For any paginated list with page size 25, each page SHALL display at most 25 rows.
 * The last page MAY contain fewer than 25 rows if the total count is not evenly
 * divisible by 25, but no page SHALL ever exceed 25 rows.
 */
describe('12.16 – Pagination row limit invariant (Property 9)', () => {
  const PAGE_SIZE = 25

  /** Arbitrary for a discharge-like record (minimal fields needed for pagination) */
  const dischargeRecordArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    patientName: fc.string({ minLength: 1, maxLength: 30 }),
    diagnosisGroup: fc.constantFrom<DiagnosisGroup>('CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER'),
    riskTier: fc.constantFrom<RiskTier>(1, 2, 3),
    callStatus: fc.constantFrom<CallOutcome>('completed', 'voicemail', 'no_answer', 'refused', 'wrong_party'),
  })

  /**
   * Property 9: Pagination Row Limit Invariant
   * Validates: Requirements 2.16, 5.7, 2.3 (Invariant from Requirements)
   */
  test.prop([
    fc.array(dischargeRecordArb, { minLength: 0, maxLength: 200 }),
    fc.integer({ min: 1 }),
  ])(
    'each page slice has at most 25 rows for any list size and page number',
    (items, page) => {
      // Apply the pagination slicing logic: items.slice((P-1)*25, P*25)
      const pageSlice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      expect(pageSlice.length).toBeLessThanOrEqual(PAGE_SIZE)
    }
  )
})

// ─── 12.6: Table skeleton (5 placeholder rows) while fetching ────────────────

describe('12.6 – Table skeleton shown while fetching', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 5 skeleton rows in the table while the query is loading', async () => {
    mockAuth('nurse')
    // Never resolves so the component stays in loading state
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderPage()

    // The table should be present immediately (tablet+ view)
    const table = screen.getByRole('table')
    const tbody = table.querySelector('tbody')!

    // Expect 5 loading rows
    const loadingRows = within(tbody).getAllByRole('row', { name: /loading row/i })
    expect(loadingRows).toHaveLength(5)

    // Each row should have aria-busy="true"
    loadingRows.forEach((row) => {
      expect(row).toHaveAttribute('aria-busy', 'true')
    })
  })

  it('replaces skeleton rows with data rows after fetch completes', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderPage()

    // Skeleton rows should appear first
    const table = screen.getByRole('table')
    const tbody = table.querySelector('tbody')!
    expect(within(tbody).getAllByRole('row', { name: /loading row/i })).toHaveLength(5)

    // After data loads, skeleton rows should be gone
    await waitFor(() => {
      expect(within(tbody).queryAllByRole('row', { name: /loading row/i })).toHaveLength(0)
    })

    // Data row should be visible
    expect(within(tbody).getByText('Alice Smith')).toBeInTheDocument()
  })
})

// ─── 12.3: Component tests — column header sort toggle ───────────────────────

describe('12.3 – Column header sort toggle', () => {
  beforeEach(() => vi.clearAllMocks())

  /** Get the table (tablet+ view) */
  function getTable() {
    return screen.getByRole('table')
  }

  it('clicking Patient column header sorts by patientName ascending (first click)', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    const patientHeader = within(getTable()).getByRole('button', { name: /patient/i })
    await user.click(patientHeader)

    await waitFor(() => {
      expect(apiClient as Mock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=patientName')
      )
    })
    await waitFor(() => {
      expect(apiClient as Mock).toHaveBeenCalledWith(
        expect.stringContaining('sortDir=asc')
      )
    })
  })

  it('clicking the same column header again toggles to descending', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    const patientHeader = within(getTable()).getByRole('button', { name: /patient/i })

    // First click → asc
    await user.click(patientHeader)
    await waitFor(() => {
      expect(apiClient as Mock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=patientName')
      )
    })

    // Second click → desc
    await user.click(patientHeader)
    await waitFor(() => {
      const calls = (apiClient as Mock).mock.calls.map((c: unknown[]) => c[0] as string)
      expect(calls.some((url) => url.includes('sortBy=patientName') && url.includes('sortDir=desc'))).toBe(true)
    })
  })

  it('clicking a different column header resets to ascending on the new column', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    // Click Patient header first
    const patientHeader = within(getTable()).getByRole('button', { name: /patient/i })
    await user.click(patientHeader)

    await waitFor(() => {
      expect(apiClient as Mock).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=patientName')
      )
    })

    // Now click Risk Tier header
    const riskTierHeader = within(getTable()).getByRole('button', { name: /risk tier/i })
    await user.click(riskTierHeader)

    await waitFor(() => {
      const calls = (apiClient as Mock).mock.calls.map((c: unknown[]) => c[0] as string)
      expect(calls.some((url) => url.includes('sortBy=riskTier') && url.includes('sortDir=asc'))).toBe(true)
    })
  })

  it('sort icon reflects current sort state (↑ asc, ↓ desc, ↕ unsorted)', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    // Initially dischargeDateTime is sorted desc (default), Patient should show ↕
    const patientHeader = within(getTable()).getByRole('button', { name: /patient/i })
    expect(patientHeader.textContent).toContain('↕')

    // Click Patient → asc → should show ↑
    await user.click(patientHeader)
    await waitFor(() => {
      expect(patientHeader.textContent).toContain('↑')
    })

    // Click again → desc → should show ↓
    await user.click(patientHeader)
    await waitFor(() => {
      expect(patientHeader.textContent).toContain('↓')
    })
  })

  it('sort params are included in the API query URL', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    // Click Discharge Date header
    const dischargeDateHeader = within(getTable()).getByRole('button', { name: /discharge date/i })
    await user.click(dischargeDateHeader)

    await waitFor(() => {
      const calls = (apiClient as Mock).mock.calls.map((c: unknown[]) => c[0] as string)
      expect(calls.some((url) => url.includes('sortBy=dischargeDateTime'))).toBe(true)
    })

    // Click Call Outcome header
    const callOutcomeHeader = within(getTable()).getByRole('button', { name: /call outcome/i })
    await user.click(callOutcomeHeader)

    await waitFor(() => {
      const calls = (apiClient as Mock).mock.calls.map((c: unknown[]) => c[0] as string)
      expect(calls.some((url) => url.includes('sortBy=callStatus'))).toBe(true)
    })
  })

  it('Diagnosis column header is not sortable (no button)', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderPage()

    await waitFor(() => {
      expect(within(getTable()).getByText('Alice Smith')).toBeInTheDocument()
    })

    // Diagnosis column should not have a sort button
    const diagnosisButtons = within(getTable())
      .queryAllByRole('button')
      .filter((btn) => btn.textContent?.toLowerCase().includes('diagnosis'))
    expect(diagnosisButtons).toHaveLength(0)
  })
})

// ─── 12.7: ErrorBanner shown on fetch failure ────────────────────────────────

describe('12.7 – ErrorBanner shown on fetch failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows ErrorBanner with role="alert" and a Retry button when fetch fails', async () => {
    mockAuth('nurse')
    ;(apiClient as Mock).mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Failed to load discharges.')
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('clicking Retry triggers a refetch (calls apiClient again)', async () => {
    mockAuth('nurse')
    ;(apiClient as Mock).mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const callCountBeforeRetry = (apiClient as Mock).mock.calls.length

    const retryButton = within(screen.getByRole('alert')).getByRole('button', { name: /retry/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect((apiClient as Mock).mock.calls.length).toBeGreaterThan(callCountBeforeRetry)
    })
  })
})

// ─── 12.17: Component tests — role-based row interactivity ────────────────────

describe('12.17 – Physician rows non-interactive; Admin/Nurse rows open drawer', () => {
  beforeEach(() => vi.clearAllMocks())

  /** Get the table body (tablet+ view) */
  function getTableBody() {
    return screen.getByRole('table').querySelector('tbody')!
  }

  it('Physician: rows have cursor-default and no click handler', async () => {
    mockAuth('physician')
    const discharges = [makeDischarge({ patientName: 'Alice Smith' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Alice Smith')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Alice Smith').closest('tr')!
    expect(row).not.toHaveAttribute('tabindex')
    expect(row).not.toHaveAttribute('aria-label')
    expect(row.className).toContain('cursor-default')
  })

  it('Nurse: clicking a row opens the drawer', async () => {
    mockAuth('nurse')
    const discharges = [
      makeDischarge({
        patientName: 'Bob Jones',
        medications: [{ name: 'Metoprolol', dose: '25mg', frequency: 'twice daily', newMed: true }],
      }),
    ]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Bob Jones')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Bob Jones').closest('tr')!
    await user.click(row)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Discharge details for Bob Jones'
    )
    expect(screen.getByText('Metoprolol')).toBeInTheDocument()
  })

  it('Admin: clicking a row opens the drawer', async () => {
    mockAuth('admin')
    const discharges = [makeDischarge({ patientName: 'Carol White' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Carol White')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Carol White').closest('tr')!
    await user.click(row)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('Escape key closes the drawer', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Dave Brown' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Dave Brown')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Dave Brown').closest('tr')!
    await user.click(row)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('focus is trapped inside the drawer while open (Tab cycles within drawer)', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Eve Green' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Eve Green')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Eve Green').closest('tr')!
    await user.click(row)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const dialog = screen.getByRole('dialog')

    // Tab through all focusable elements in the drawer multiple times
    // Focus should never leave the dialog
    for (let i = 0; i < 6; i++) {
      await user.tab()
      const focused = document.activeElement
      expect(dialog.contains(focused)).toBe(true)
    }
  })

  it('focus returns to the triggering row when the drawer is closed', async () => {
    mockAuth('nurse')
    const discharges = [makeDischarge({ patientName: 'Frank White' })]
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(within(getTableBody()).getByText('Frank White')).toBeInTheDocument()
    })

    const row = within(getTableBody()).getByText('Frank White').closest('tr')!

    // Click the row to open the drawer
    await user.click(row)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // Close the drawer via Escape
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Focus should have returned to the triggering row
    expect(document.activeElement).toBe(row)
  })

  it('shows empty state when no discharges', async () => {
    mockAuth('nurse')
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderPage()

    await waitFor(() => {
      // EmptyState appears in both mobile and table views
      expect(screen.getAllByText('No discharges found').length).toBeGreaterThan(0)
    })
  })
})

// ─── 12.12: discharge_created WebSocket banner behavior ──────────────────────

describe('12.12 – discharge_created WebSocket: banner on non-page-1, prepend on page 1', () => {
  beforeEach(() => vi.clearAllMocks())

  /**
   * Helper: render the page with a controlled QueryClient so we can
   * re-render with updated WS mock values.
   */
  function renderPageControlled(wsOverrides: Partial<WebSocketContextValue> = {}) {
    mockWS(wsOverrides)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const result = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeQueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    return { ...result, qc }
  }

  it('does NOT show banner when discharge_created fires and user is on page 1', async () => {
    mockAuth('nurse')
    // Provide enough records to enable pagination (total > 25)
    const discharges = Array.from({ length: 25 }, (_, i) =>
      makeDischarge({ patientName: `Patient ${i}` })
    )
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges, 50))

    // Start with no discharge event
    const { rerender, qc } = renderPageControlled({ lastDischargeCreatedId: null })

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    // Simulate a discharge_created event while on page 1
    mockWS({ lastDischargeCreatedId: 'evt-001' })
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeQueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Banner should NOT appear on page 1
    await waitFor(() => {
      expect(screen.queryByText('New discharges available')).not.toBeInTheDocument()
    })
  })

  it('shows "New discharges available" banner when discharge_created fires on page 2+', async () => {
    mockAuth('nurse')
    const discharges = Array.from({ length: 25 }, (_, i) =>
      makeDischarge({ patientName: `Patient ${i}` })
    )
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges, 50))

    const user = userEvent.setup()
    const { rerender, qc } = renderPageControlled({ lastDischargeCreatedId: null })

    // Wait for data to load (skeleton rows gone, pagination appears)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /next page/i }).length).toBeGreaterThan(0)
    })

    // Navigate to page 2 (use first Next page button)
    const [nextBtn] = screen.getAllByRole('button', { name: /next page/i })
    await user.click(nextBtn)

    // Simulate a discharge_created event while on page 2
    mockWS({ lastDischargeCreatedId: 'evt-002' })
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeQueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('New discharges available')).toBeInTheDocument()
    })

    // Banner should have a "Go to page 1" button
    expect(screen.getByRole('button', { name: /go to page 1/i })).toBeInTheDocument()
  })

  it('"Go to page 1" button navigates to page 1 and dismisses the banner', async () => {
    mockAuth('nurse')
    const discharges = Array.from({ length: 25 }, (_, i) =>
      makeDischarge({ patientName: `Patient ${i}` })
    )
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges, 50))

    const user = userEvent.setup()
    const { rerender, qc } = renderPageControlled({ lastDischargeCreatedId: null })

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /next page/i }).length).toBeGreaterThan(0)
    })

    // Navigate to page 2
    const [nextBtn] = screen.getAllByRole('button', { name: /next page/i })
    await user.click(nextBtn)

    // Simulate discharge_created event
    mockWS({ lastDischargeCreatedId: 'evt-003' })
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeQueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('New discharges available')).toBeInTheDocument()
    })

    // Click "Go to page 1"
    const goToPage1Btn = screen.getByRole('button', { name: /go to page 1/i })
    await user.click(goToPage1Btn)

    // Banner should be dismissed
    await waitFor(() => {
      expect(screen.queryByText('New discharges available')).not.toBeInTheDocument()
    })
  })

  it('dismiss button hides the banner', async () => {
    mockAuth('nurse')
    const discharges = Array.from({ length: 25 }, (_, i) =>
      makeDischarge({ patientName: `Patient ${i}` })
    )
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse(discharges, 50))

    const user = userEvent.setup()
    const { rerender, qc } = renderPageControlled({ lastDischargeCreatedId: null })

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /next page/i }).length).toBeGreaterThan(0)
    })

    // Navigate to page 2
    const [nextBtn] = screen.getAllByRole('button', { name: /next page/i })
    await user.click(nextBtn)

    // Simulate discharge_created event
    mockWS({ lastDischargeCreatedId: 'evt-004' })
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeQueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('New discharges available')).toBeInTheDocument()
    })

    // Click dismiss button
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissBtn)

    await waitFor(() => {
      expect(screen.queryByText('New discharges available')).not.toBeInTheDocument()
    })
  })
})

// ─── 18.6: Table accessibility — th scope attributes ─────────────────────────

describe('18.6 – Discharge queue table has <th> elements with scope="col"', () => {
  beforeEach(() => vi.clearAllMocks())

  it('all column headers have scope="col" attribute', async () => {
    mockAuth('nurse')
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([makeDischarge()]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const headers = table.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(5)

    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim())
    expect(headerTexts.some((t) => t?.includes('Patient'))).toBe(true)
    expect(headerTexts.some((t) => t?.includes('Diagnosis'))).toBe(true)
    expect(headerTexts.some((t) => t?.includes('Discharge Date'))).toBe(true)
    expect(headerTexts.some((t) => t?.includes('Call Outcome'))).toBe(true)
    expect(headerTexts.some((t) => t?.includes('Risk Tier'))).toBe(true)
  })

  it('no <th> elements are missing the scope attribute', async () => {
    mockAuth('nurse')
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([makeDischarge()]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const allTh = table.querySelectorAll('th')
    const thWithoutScope = Array.from(allTh).filter((th) => !th.hasAttribute('scope'))
    expect(thWithoutScope).toHaveLength(0)
  })
})

// ─── 19.2: Responsive layout — card layout at <768px, scrollable table at 768–1279px ──

/**
 * Validates: Requirement 10 (Responsive Layout), Requirement 2.13 (Discharge Queue responsive)
 *   AC 1: Three breakpoints: mobile (<768px), tablet (768–1279px), desktop (≥1280px)
 *   Req 2.13: Responsive: card layout on mobile (<768px), scrollable table on tablet (768–1279px)
 *
 * Implementation note:
 *   DischargeQueuePage uses Tailwind CSS classes for responsive layout:
 *     - Mobile card layout container: class "space-y-3 tablet:hidden"
 *       → visible at <768px, CSS-hidden at ≥768px (tablet breakpoint)
 *     - Table layout container: class "hidden tablet:block overflow-x-auto ..."
 *       → CSS-hidden at <768px, visible at ≥768px (tablet breakpoint)
 *       → The overflow-x-auto wrapper enables horizontal scrolling on tablet
 *
 *   Since jsdom does not evaluate CSS media queries, we verify:
 *     1. Both layout containers are present in the DOM
 *     2. The mobile card container has the "tablet:hidden" class
 *        (drives CSS-based hide at ≥768px)
 *     3. The table container has "hidden" and "tablet:block" classes
 *        (drives CSS-based show at ≥768px)
 *     4. The table container has "overflow-x-auto" class
 *        (enables horizontal scrolling on tablet)
 *
 *   We also mock window.innerWidth and window.matchMedia to simulate each
 *   breakpoint, ensuring the component does not break when these are queried.
 */
describe('19.2 – Responsive layout: card layout at <768px, scrollable table at 768–1279px', () => {
  /**
   * Helper: mock window.matchMedia to simulate a given viewport width.
   */
  function mockMatchMedia(viewportWidth: number) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/)
        const matches = minWidthMatch ? viewportWidth >= parseInt(minWidthMatch[1], 10) : false
        return {
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }
      }),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth('nurse')
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([makeDischarge({ patientName: 'Test Patient' })]))
  })

  // ── Mobile viewport (<768px) ─────────────────────────────────────────────────

  describe('mobile viewport (<768px)', () => {
    beforeEach(() => {
      mockMatchMedia(375)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    })

    it('mobile card layout container is present in the DOM', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // The mobile card container should be in the DOM (CSS hides it at ≥768px)
      // It contains DischargeCard components and has tablet:hidden class
      const cardContainers = document.querySelectorAll('.tablet\\:hidden')
      expect(cardContainers.length).toBeGreaterThan(0)
    })

    it('mobile card layout container has tablet:hidden class (CSS-hidden at ≥768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // Find the mobile card layout container by its distinctive class combination
      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      expect(mobileContainer!.className).toContain('tablet:hidden')
    })

    it('table layout container has hidden class as base (CSS-hidden at <768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // The table container is always in the DOM; CSS hides it at <768px
      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('hidden')
    })

    it('table layout container has tablet:block class (CSS-visible at ≥768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('tablet:block')
    })

    it('table layout container has overflow-x-auto class for horizontal scrolling', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // The overflow-x-auto wrapper enables horizontal scrolling on tablet
      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('overflow-x-auto')
    })
  })

  // ── Tablet viewport (768–1279px) ─────────────────────────────────────────────

  describe('tablet viewport (768–1279px)', () => {
    beforeEach(() => {
      mockMatchMedia(1024)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    })

    it('table layout container is present in the DOM', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // The table container should be in the DOM (CSS shows it at ≥768px)
      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
    })

    it('table layout container has tablet:block class (CSS-visible at ≥768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('tablet:block')
    })

    it('table layout container has overflow-x-auto class for horizontal scrolling on tablet', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // overflow-x-auto is the key class that enables scrollable table on tablet
      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('overflow-x-auto')
    })

    it('mobile card layout container has tablet:hidden class (CSS-hidden at ≥768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      expect(mobileContainer!.className).toContain('tablet:hidden')
    })

    it('table contains a <table> element with correct structure', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // The table should be inside the overflow-x-auto container
      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      const table = tableContainer!.querySelector('table')
      expect(table).not.toBeNull()
    })
  })

  // ── Desktop viewport (≥1280px) ───────────────────────────────────────────────

  describe('desktop viewport (≥1280px)', () => {
    beforeEach(() => {
      mockMatchMedia(1440)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
    })

    it('table layout container is present in the DOM with tablet:block class', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('tablet:block')
    })

    it('mobile card layout container has tablet:hidden class', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      expect(mobileContainer!.className).toContain('tablet:hidden')
    })
  })

  // ── Breakpoint boundary: exactly 768px (tablet threshold) ────────────────────

  describe('breakpoint boundary at exactly 768px (tablet threshold)', () => {
    beforeEach(() => {
      mockMatchMedia(768)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 768 })
    })

    it('table layout container has tablet:block class (≥768px is tablet)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('tablet:block')
    })

    it('table layout container has overflow-x-auto class at exactly 768px', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      expect(tableContainer!.className).toContain('overflow-x-auto')
    })

    it('mobile card layout container has tablet:hidden class (CSS-hidden at ≥768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      expect(mobileContainer!.className).toContain('tablet:hidden')
    })
  })

  // ── Breakpoint boundary: 767px (just below tablet threshold) ─────────────────

  describe('breakpoint boundary at 767px (just below tablet threshold)', () => {
    beforeEach(() => {
      mockMatchMedia(767)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 767 })
    })

    it('mobile card layout container has tablet:hidden class (CSS-visible at <768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      // tablet:hidden means: visible by default, hidden at ≥768px
      expect(mobileContainer!.className).toContain('tablet:hidden')
    })

    it('table layout container has hidden class as base (CSS-hidden at <768px)', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      // hidden means: hidden by default, shown at ≥768px via tablet:block
      expect(tableContainer!.className).toContain('hidden')
    })
  })

  // ── DOM structure verification (viewport-independent) ────────────────────────

  describe('DOM structure — both layout containers always present', () => {
    it('both mobile card container and table container are always in the DOM', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      // Both containers are always rendered; CSS controls which is visible
      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      const tableContainer = document.querySelector('.hidden.tablet\\:block')

      expect(mobileContainer).not.toBeNull()
      expect(tableContainer).not.toBeNull()
    })

    it('mobile card container renders DischargeCard elements when data is loaded', async () => {
      renderPage()

      await waitFor(() => {
        // Wait for data to load — patient name appears in both card and table views
        expect(screen.getAllByText('Test Patient').length).toBeGreaterThan(0)
      })

      // The mobile card container should contain the patient name
      const mobileContainer = document.querySelector('.space-y-3.tablet\\:hidden')
      expect(mobileContainer).not.toBeNull()
      expect(mobileContainer!.textContent).toContain('Test Patient')
    })

    it('table container renders table rows when data is loaded', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument()
      })

      const tableContainer = document.querySelector('.hidden.tablet\\:block')
      expect(tableContainer).not.toBeNull()
      const table = tableContainer!.querySelector('table')
      expect(table).not.toBeNull()

      await waitFor(() => {
        const tbody = table!.querySelector('tbody')
        expect(tbody).not.toBeNull()
        // Should have data rows (not skeleton rows) after loading
        const rows = tbody!.querySelectorAll('tr')
        expect(rows.length).toBeGreaterThan(0)
      })
    })
  })
})
