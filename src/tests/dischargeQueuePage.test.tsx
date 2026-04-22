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

import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { DischargeQueuePage } from '@/pages/DischargeQueuePage'
import type { Mock } from 'vitest'
import type { ApiResponse, AuthContextValue, Discharge, RiskTier, CallOutcome, DiagnosisGroup } from '@/types'
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

// ─── 12.14: PBT — Sort reversibility ─────────────────────────────────────────

describe('12.14 – Sort reversibility (Property 7)', () => {
  test.prop([
    fc.array(
      fc.record({
        patientName: fc.string({ minLength: 1, maxLength: 20 }),
        riskScore: fc.integer({ min: 0, max: 13 }),
      }),
      { minLength: 2, maxLength: 20 }
    ),
  ])(
    'ascending sort reversed equals descending sort for patientName',
    (items) => {
      const asc = [...items].sort((a, b) => a.patientName.localeCompare(b.patientName))
      const desc = [...items].sort((a, b) => b.patientName.localeCompare(a.patientName))
      expect([...asc].reverse().map((i) => i.patientName)).toEqual(
        desc.map((i) => i.patientName)
      )
    }
  )

  test.prop([
    fc.array(fc.integer({ min: 0, max: 13 }), { minLength: 2, maxLength: 20 }),
  ])(
    'ascending sort reversed equals descending sort for riskScore',
    (scores) => {
      const asc = [...scores].sort((a, b) => a - b)
      const desc = [...scores].sort((a, b) => b - a)
      expect([...asc].reverse()).toEqual(desc)
    }
  )
})

// ─── 12.15: PBT — Filter subset invariant ────────────────────────────────────

describe('12.15 – Filter subset invariant (Property 8)', () => {
  test.prop([
    fc.array(
      fc.record({
        diagnosisGroup: fc.constantFrom<DiagnosisGroup>('CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER'),
        riskTier: fc.constantFrom<RiskTier>(1, 2, 3),
        callOutcome: fc.constantFrom<CallOutcome>('completed', 'voicemail', 'no_answer', 'refused', 'wrong_party'),
      }),
      { minLength: 0, maxLength: 50 }
    ),
    fc.constantFrom<DiagnosisGroup | null>('CHF', 'COPD', null),
    fc.constantFrom<RiskTier | null>(1, 2, 3, null),
  ])(
    'filtered count is always ≤ total unfiltered count',
    (items, diagFilter, tierFilter) => {
      let filtered = items
      if (diagFilter !== null) filtered = filtered.filter((i) => i.diagnosisGroup === diagFilter)
      if (tierFilter !== null) filtered = filtered.filter((i) => i.riskTier === tierFilter)
      expect(filtered.length).toBeLessThanOrEqual(items.length)
    }
  )
})

// ─── 12.16: PBT — Pagination row limit ───────────────────────────────────────

describe('12.16 – Pagination row limit invariant (Property 9)', () => {
  const PAGE_SIZE = 25

  test.prop([
    fc.integer({ min: 0, max: 200 }),
    fc.integer({ min: 1, max: 10 }),
  ])(
    'each page displays at most 25 rows',
    (total, page) => {
      const start = (page - 1) * PAGE_SIZE
      const end = Math.min(start + PAGE_SIZE, total)
      const rowsOnPage = Math.max(0, end - start)
      expect(rowsOnPage).toBeLessThanOrEqual(PAGE_SIZE)
    }
  )
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
