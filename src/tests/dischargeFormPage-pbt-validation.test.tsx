/**
 * Property-Based Tests for DischargeFormPage — Form Validation Submission Blocking
 *
 * Task: 16.13 Write PBT for form validation submission blocking
 * Property: Property 10 — Form Validation Submission Blocking
 *
 * For any discharge form state, the form submission handler SHALL never invoke
 * `POST /discharges` when any required field (patient, diagnosis group, ICD-10 code,
 * discharge datetime, medications) is missing or invalid.
 * The submission SHALL be blocked at the client side before any network request is initiated.
 *
 * Validates: Requirements 6.7, 6.8
 */

import { describe, expect, vi, beforeEach } from 'vitest'
import { test } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── API client mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/apiClient', () => ({
  apiClient: vi.fn(),
}))

// ─── Auth context mock ────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { DischargeFormPage } from '@/pages/DischargeFormPage'
import { apiClient } from '@/lib/apiClient'
import type { Mock } from 'vitest'
import type { AuthContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'admin@example.com' } as unknown as User

function mockAuth(overrides: Partial<AuthContextValue> = {}) {
  ;(useAuth as Mock).mockReturnValue({
    user: fakeUser,
    role: 'admin',
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
    ...overrides,
  } satisfies AuthContextValue)
}

// ─── Mock PatientSearchAutocomplete ───────────────────────────────────────────

vi.mock('@/components/PatientSearchAutocomplete', () => ({
  PatientSearchAutocomplete: ({
    onPatientSelected,
    error,
    errorId,
  }: {
    onPatientSelected: (p: { id: string; name: string; isNew: boolean } | null) => void
    error?: string
    errorId?: string
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onPatientSelected({ id: 'p1', name: 'John Doe', isNew: false })}
      >
        Select patient
      </button>
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  ),
}))

// ─── Test: Form validation submission blocking ────────────────────────────────

describe('16.13 – PBT: Form validation submission blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  // ── Property 10: Random missing-field states never call POST /discharges ───

  /**
   * Property: For any discharge form state with missing/invalid required fields,
   * the form submission SHALL be blocked before any network request.
   *
   * We test this by generating random form states with various missing/invalid fields
   * and verifying that POST /discharges is never called.
   */

  test.prop(
    [
      // Generate random combinations of missing fields
      fc.oneof(
        // Missing patient only
        fc.constant('missing-patient'),
        // Missing diagnosis group only
        fc.constant('missing-diagnosis'),
        // Missing ICD-10 only
        fc.constant('missing-icd10'),
        // Missing datetime only
        fc.constant('missing-datetime'),
        // Missing medications only
        fc.constant('missing-medications'),
        // Missing risk level only
        fc.constant('missing-risk'),
        // Multiple missing fields
        fc.constant('multiple-missing'),
        // Invalid ICD-10 code
        fc.constant('invalid-icd10'),
        // Future datetime
        fc.constant('future-datetime'),
        // Empty medications
        fc.constant('empty-medications')
      ),
    ],
    { numRuns: 5 }
  )(
    'random missing-field state never calls POST /discharges ($)',
    async (scenario) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <DischargeFormPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Fill form based on scenario, leaving some fields missing/invalid
      switch (scenario) {
        case 'missing-patient':
          // Don't select patient
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'missing-diagnosis':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          // Don't select diagnosis group
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'missing-icd10':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          // Don't enter ICD-10 code
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'missing-datetime':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          // Don't set datetime
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'missing-medications':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          // Don't add medications
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'missing-risk':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          // Don't select risk level
          break

        case 'multiple-missing':
          // Only select patient, leave everything else empty
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          break

        case 'invalid-icd10':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'INVALID')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'future-datetime':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          // Set future datetime
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2099-12-31T23:59' },
          })
          await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break

        case 'empty-medications':
          await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /diagnosis group/i }),
            'CHF'
          )
          await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
          fireEvent.change(screen.getByLabelText(/discharge date/i), {
            target: { value: '2024-01-15T10:30' },
          })
          // Clear all medications
          // (form starts with one empty row)
          await userEvent.selectOptions(
            screen.getByRole('combobox', { name: /risk level/i }),
            'low'
          )
          break
      }

      // Submit the form
      await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

      // Verify POST /discharges was NOT called
      const dischargeCalls = (apiClient as Mock).mock.calls.filter(
        (call: unknown[]) => Array.isArray(call) && call.length > 0 && call[0] === '/api/discharges'
      )
      expect(dischargeCalls).toHaveLength(0)

      unmount()
    }
  )

  // ── Additional property: Invalid ICD-10 codes are rejected ──────────────────

  test.prop(
    [
      // Generate invalid ICD-10 codes (must fail the regex pattern)
      // Note: Empty string is handled separately to avoid userEvent issues
      fc.oneof(
        fc.constant('INVALID'),
        fc.constant('123ABC'),
        fc.constant('A1'),
        fc.constant('AB123'),
        fc.constant('a12.3'),
        fc.constant('I50.99999'), // too many digits after dot (max 4)
        fc.constant('I50.999999'), // way too many digits
        fc.constant('   '), // whitespace only
      ),
    ],
    { numRuns: 5 }
  )(
    'invalid ICD-10 code "$" never calls POST /discharges',
    async (invalidCode) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <DischargeFormPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Fill all required fields with valid data except ICD-10
      await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /diagnosis group/i }),
        'CHF'
      )
      await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), invalidCode)
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: '2024-01-15T10:30' },
      })
      await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /risk level/i }),
        'low'
      )

      // Submit
      await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

      // Verify POST /discharges was NOT called
      const dischargeCalls = (apiClient as Mock).mock.calls.filter(
        (call: unknown[]) => Array.isArray(call) && call.length > 0 && call[0] === '/api/discharges'
      )
      expect(dischargeCalls).toHaveLength(0)

      unmount()
    }
  )

  // ── Additional property: Empty ICD-10 code is rejected ─────────────────────

  it('empty ICD-10 code never calls POST /discharges', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeFormPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Fill all required fields with valid data except ICD-10
    await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    // Leave ICD-10 empty
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-01-15T10:30' },
    })
    await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /risk level/i }),
      'low'
    )

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

    // Verify POST /discharges was NOT called
    const dischargeCalls = (apiClient as Mock).mock.calls.filter(
      (call: unknown[]) => Array.isArray(call) && call.length > 0 && call[0] === '/api/discharges'
    )
    expect(dischargeCalls).toHaveLength(0)

    unmount()
  })

  // ── Additional property: Future datetimes are rejected ─────────────────────

  test.prop(
    [
      // Generate future dates
      fc.date({ min: new Date(Date.now() + 86400000), max: new Date('2099-12-31') }),
    ],
    { numRuns: 3 }
  )('future datetime never calls POST /discharges', async (futureDate) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeFormPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Format date for datetime-local input
    const futureDateTime = futureDate.toISOString().slice(0, 16)

    // Fill all required fields with valid data except datetime
    await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: futureDateTime },
    })
    await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /risk level/i }),
      'low'
    )

    // Submit
    await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

    // Verify POST /discharges was NOT called
    const dischargeCalls = (apiClient as Mock).mock.calls.filter(
      (call: unknown[]) => Array.isArray(call) && call.length > 0 && call[0] === '/api/discharges'
    )
    expect(dischargeCalls).toHaveLength(0)

    unmount()
  })
})

// ─── 16.14 – PBT: Future Datetime Rejection ──────────────────────────────────

// Feature: readmission-prevention-dashboard, Property 11: Future Datetime Rejection

/**
 * Property-Based Tests for DischargeFormPage — Future Datetime Rejection
 *
 * Task: 16.14 Write PBT for future datetime rejection
 * Property: Property 11 — Future Datetime Rejection
 *
 * For any datetime value selected in the discharge datetime picker, if the datetime
 * is in the future (greater than the current moment), the form validation SHALL reject
 * the value and display the error "Discharge time cannot be in the future".
 * All past and present datetimes SHALL be accepted.
 *
 * Validates: Requirements 6.4, 6.10
 */

describe('16.14 – PBT: Future Datetime Rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  // ── Property 11a: Future dates are rejected with the correct error message ──

  /**
   * **Validates: Requirements 6.4, 6.10**
   *
   * For any future datetime, the form SHALL display
   * "Discharge time cannot be in the future" and SHALL NOT call POST /discharges.
   */
  test.prop(
    [
      // Generate future dates (at least 1 minute in the future to avoid flakiness)
      fc.date({ min: new Date(Date.now() + 60_000), max: new Date('2099-12-31T23:59:59') }),
    ],
    { numRuns: 10 }
  )(
    'future datetime is rejected with error "Discharge time cannot be in the future"',
    async (futureDate) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <DischargeFormPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Format the future date as "YYYY-MM-DDTHH:mm" for datetime-local input
      const pad = (n: number) => String(n).padStart(2, '0')
      const futureDateTimeLocal =
        `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}` +
        `T${pad(futureDate.getHours())}:${pad(futureDate.getMinutes())}`

      // Fill all required fields with valid data, using the future datetime
      await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /diagnosis group/i }),
        'CHF'
      )
      await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: futureDateTimeLocal },
      })
      await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /risk level/i }),
        'low'
      )

      // Submit the form
      await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

      // The error message MUST be displayed
      expect(
        screen.getByText('Discharge time cannot be in the future.')
      ).toBeInTheDocument()

      // POST /discharges MUST NOT be called
      const dischargeCalls = (apiClient as Mock).mock.calls.filter(
        (call: unknown[]) => Array.isArray(call) && call.length > 0 && call[0] === '/api/discharges'
      )
      expect(dischargeCalls).toHaveLength(0)

      unmount()
    }
  )

  // ── Property 11b: Past/present dates are accepted (no datetime error shown) ─

  /**
   * **Validates: Requirements 6.4**
   *
   * For any past or present datetime, the form SHALL NOT display a datetime
   * validation error. The datetime field is considered valid.
   */
  test.prop(
    [
      // Generate past dates (up to 10 years ago, at least 1 minute in the past)
      fc.date({ min: new Date('2000-01-01T00:00:00'), max: new Date(Date.now() - 60_000) }),
    ],
    { numRuns: 10 }
  )(
    'past/present datetime is accepted — no datetime error displayed',
    async (pastDate) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <DischargeFormPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Format the past date as "YYYY-MM-DDTHH:mm" for datetime-local input
      const pad = (n: number) => String(n).padStart(2, '0')
      const pastDateTimeLocal =
        `${pastDate.getFullYear()}-${pad(pastDate.getMonth() + 1)}-${pad(pastDate.getDate())}` +
        `T${pad(pastDate.getHours())}:${pad(pastDate.getMinutes())}`

      // Fill all required fields with valid data, using the past datetime
      await userEvent.click(screen.getByRole('button', { name: /select patient/i }))
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /diagnosis group/i }),
        'CHF'
      )
      await userEvent.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: pastDateTimeLocal },
      })
      await userEvent.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /risk level/i }),
        'low'
      )

      // Submit the form
      await userEvent.click(screen.getByRole('button', { name: /create discharge/i }))

      // The datetime error MUST NOT be displayed
      expect(
        screen.queryByText('Discharge time cannot be in the future.')
      ).not.toBeInTheDocument()

      unmount()
    }
  )
})
