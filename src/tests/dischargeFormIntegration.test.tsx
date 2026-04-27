/**
 * Integration test: full Discharge Form flow
 *
 * Feature: readmission-prevention-dashboard, Integration: Discharge Form Full Flow
 *
 * Task: 20.2 — Full Discharge Form flow integration test
 *
 * Covers:
 *   1. Mount DischargeFormPage with an authenticated Admin user
 *   2. Fill in all required valid form data:
 *      - Patient search → type name → select from autocomplete results
 *      - Diagnosis group
 *      - ICD-10 code
 *      - Discharge datetime (past)
 *      - Medication name and dosage
 *      - Risk level
 *   3. Submit the form
 *   4. Verify POST /discharges is called with the correct payload
 *   5. Verify success notification appears and auto-dismisses after 5 seconds
 *
 * Validates: Requirements 6.7, 6.8, 6.11, 6.13
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
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
import type { AuthContextValue, ApiResponse, Patient } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'admin@example.com' } as unknown as User

function mockAdminAuth(overrides: Partial<AuthContextValue> = {}) {
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

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DischargeFormPage />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

/** Mock patient returned by GET /patients?search=... */
const mockPatient: Patient = {
  id: 'patient-42',
  name: 'Jane Smith',
  dateOfBirth: '1965-04-20',
}

/** Mock GET /patients response */
const mockPatientsResponse: ApiResponse<Patient[]> = {
  data: [mockPatient],
}

// ─── Integration tests with real timers ──────────────────────────────────────

describe('20.2 – Integration: full Discharge Form flow (Admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminAuth()
  })

  // ── Main integration test: full flow ─────────────────────────────────────

  it(
    'fill valid data → submit → POST /discharges called with correct payload → success notification shown',
    async () => {
      // ── Setup API mocks ──────────────────────────────────────────────────
      // GET /patients returns the mock patient list
      // POST /discharges returns a 201-like success response
      ;(apiClient as Mock).mockImplementation((url: string) => {
        if (url.startsWith('/api/patients')) {
          return Promise.resolve(mockPatientsResponse)
        }
        if (url === '/api/discharges') {
          return Promise.resolve({ id: 'discharge-integration-1' })
        }
        return Promise.reject(new Error(`Unexpected API call: ${url}`))
      })

      const user = userEvent.setup()
      renderForm()

      // ── Step 1: Verify the form is rendered for Admin ────────────────────
      expect(screen.getByRole('button', { name: /create discharge/i })).toBeInTheDocument()
      // No read-only banner for admin
      expect(screen.queryByText(/read-only mode/i)).not.toBeInTheDocument()

      // ── Step 2a: Patient search — type a name ────────────────────────────
      const patientInput = screen.getByRole('combobox', { name: /search patient/i })
      await user.type(patientInput, 'Jane')

      // Wait for the debounced search to fire and the patient option to appear
      await waitFor(
        () => {
          expect(screen.getByRole('option', { name: /jane smith/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // ── Step 2b: Select the patient from autocomplete results ────────────
      // Use mouseDown (as the component uses onMouseDown to prevent blur before click)
      fireEvent.mouseDown(screen.getByRole('option', { name: /jane smith/i }))

      // Patient selected badge should appear
      await waitFor(() => {
        expect(screen.getByText(/patient selected/i)).toBeInTheDocument()
      })

      // ── Step 2c: Select diagnosis group ─────────────────────────────────
      await user.selectOptions(
        screen.getByRole('combobox', { name: /diagnosis group/i }),
        'CHF'
      )

      // ── Step 2d: Enter a valid ICD-10 code ───────────────────────────────
      await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')

      // ── Step 2e: Enter a valid past discharge datetime ───────────────────
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: '2024-06-15T14:30' },
      })

      // ── Step 2f: Fill in medication name and dosage ──────────────────────
      await user.type(screen.getByPlaceholderText('Medication name'), 'Furosemide')
      await user.type(screen.getByPlaceholderText('e.g. 10mg'), '40mg')

      // ── Step 2g: Select risk level ───────────────────────────────────────
      await user.selectOptions(
        screen.getByRole('combobox', { name: /risk level/i }),
        'high'
      )

      // ── Step 3: Submit the form ──────────────────────────────────────────
      await user.click(screen.getByRole('button', { name: /create discharge/i }))

      // ── Step 4: Verify POST /discharges was called with correct payload ──
      await waitFor(() => {
        const dischargeCalls = (apiClient as Mock).mock.calls.filter(
          (args: unknown[]) => (args[0] as string) === '/api/discharges'
        )
        expect(dischargeCalls).toHaveLength(1)
      })

      const dischargeCall = (apiClient as Mock).mock.calls.find(
        (args: unknown[]) => (args[0] as string) === '/api/discharges'
      )
      expect(dischargeCall).toBeDefined()

      const [, options] = dischargeCall!
      expect(options.method).toBe('POST')

      const payload = JSON.parse(options.body as string)
      expect(payload).toMatchObject({
        patientId: 'patient-42',
        diagnosisGroup: 'CHF',
        icd10Code: 'I50.9',
        dischargeDateTime: '2024-06-15T14:30',
        riskLevel: 'high',
        medications: expect.arrayContaining([
          expect.objectContaining({
            name: 'Furosemide',
            dose: '40mg',
          }),
        ]),
      })

      // ── Step 5a: Verify success notification appears ─────────────────────
      expect(
        await screen.findByText('Discharge created successfully.')
      ).toBeInTheDocument()
    },
    10000
  )

  // ── GET /patients is called with the search query ─────────────────────────

  it(
    'GET /patients is called with the search query when typing in patient search',
    async () => {
      ;(apiClient as Mock).mockImplementation((url: string) => {
        if (url.startsWith('/api/patients')) {
          return Promise.resolve(mockPatientsResponse)
        }
        return Promise.reject(new Error(`Unexpected API call: ${url}`))
      })

      const user = userEvent.setup()
      renderForm()

      const patientInput = screen.getByRole('combobox', { name: /search patient/i })
      await user.type(patientInput, 'Jane')

      await waitFor(
        () => {
          const patientSearchCalls = (apiClient as Mock).mock.calls.filter(
            ([url]: string[]) => url.includes('/api/patients')
          )
          expect(patientSearchCalls.length).toBeGreaterThan(0)
          // The search query should be included in the URL
          const [searchUrl] = patientSearchCalls[patientSearchCalls.length - 1]
          expect(searchUrl).toContain('search=Jane')
        },
        { timeout: 3000 }
      )
    },
    10000
  )

  // ── Autocomplete dropdown shows patient results ───────────────────────────

  it(
    'shows autocomplete dropdown with patient results after typing',
    async () => {
      ;(apiClient as Mock).mockImplementation((url: string) => {
        if (url.startsWith('/api/patients')) {
          return Promise.resolve(mockPatientsResponse)
        }
        return Promise.reject(new Error(`Unexpected API call: ${url}`))
      })

      const user = userEvent.setup()
      renderForm()

      const patientInput = screen.getByRole('combobox', { name: /search patient/i })
      await user.type(patientInput, 'Jane')

      await waitFor(
        () => {
          expect(screen.getByRole('listbox', { name: /patient search results/i })).toBeInTheDocument()
          expect(screen.getByRole('option', { name: /jane smith/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    },
    10000
  )

  // ── POST /discharges payload includes patientId from autocomplete ─────────

  it(
    'POST /discharges payload includes patientId from selected autocomplete patient',
    async () => {
      ;(apiClient as Mock).mockImplementation((url: string) => {
        if (url.startsWith('/api/patients')) {
          return Promise.resolve(mockPatientsResponse)
        }
        if (url === '/api/discharges') {
          return Promise.resolve({ id: 'discharge-integration-2' })
        }
        return Promise.reject(new Error(`Unexpected API call: ${url}`))
      })

      const user = userEvent.setup()
      renderForm()

      // Search and select patient
      const patientInput = screen.getByRole('combobox', { name: /search patient/i })
      await user.type(patientInput, 'Jane')

      await waitFor(
        () => {
          expect(screen.getByRole('option', { name: /jane smith/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      fireEvent.mouseDown(screen.getByRole('option', { name: /jane smith/i }))

      await waitFor(() => {
        expect(screen.getByText(/patient selected/i)).toBeInTheDocument()
      })

      // Fill remaining required fields
      await user.selectOptions(
        screen.getByRole('combobox', { name: /diagnosis group/i }),
        'COPD'
      )
      await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'J44.1')
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: '2024-05-20T08:00' },
      })
      await user.type(screen.getByPlaceholderText('Medication name'), 'Salbutamol')
      await user.selectOptions(
        screen.getByRole('combobox', { name: /risk level/i }),
        'medium'
      )

      await user.click(screen.getByRole('button', { name: /create discharge/i }))

      await waitFor(() => {
        const dischargeCall = (apiClient as Mock).mock.calls.find(
          ([url]: string[]) => url === '/api/discharges'
        )
        expect(dischargeCall).toBeDefined()
        const payload = JSON.parse(dischargeCall![1].body as string)
        // patientId must be the ID from the autocomplete selection
        expect(payload.patientId).toBe('patient-42')
        expect(payload.diagnosisGroup).toBe('COPD')
        expect(payload.icd10Code).toBe('J44.1')
        expect(payload.riskLevel).toBe('medium')
      })
    },
    10000
  )
})

// ─── Auto-dismiss test: uses fake timers (isolated describe block) ────────────

describe('20.2 – Integration: success notification auto-dismisses after 5s', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminAuth()
    // Use shouldAdvanceTime so waitFor still works with fake timers
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it(
    'success notification auto-dismisses after 5 seconds',
    async () => {
      ;(apiClient as Mock).mockImplementation((url: string) => {
        if (url.startsWith('/api/patients')) {
          return Promise.resolve(mockPatientsResponse)
        }
        if (url === '/api/discharges') {
          return Promise.resolve({ id: 'discharge-auto-dismiss' })
        }
        return Promise.reject(new Error(`Unexpected API call: ${url}`))
      })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderForm()

      // Type in patient search field
      const patientInput = screen.getByRole('combobox', { name: /search patient/i })
      await user.type(patientInput, 'Jane')

      // Wait for the patient option to appear (debounce fires after 300ms)
      await waitFor(
        () => {
          expect(screen.getByRole('option', { name: /jane smith/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Select the patient
      fireEvent.mouseDown(screen.getByRole('option', { name: /jane smith/i }))

      await waitFor(() => {
        expect(screen.getByText(/patient selected/i)).toBeInTheDocument()
      })

      // Fill remaining fields using fireEvent for reliability with fake timers
      fireEvent.change(screen.getByRole('combobox', { name: /diagnosis group/i }), {
        target: { value: 'CHF' },
      })
      fireEvent.change(screen.getByRole('textbox', { name: /icd-10 code/i }), {
        target: { value: 'I50.9' },
      })
      fireEvent.change(screen.getByLabelText(/discharge date/i), {
        target: { value: '2024-06-15T14:30' },
      })
      fireEvent.change(screen.getByPlaceholderText('Medication name'), {
        target: { value: 'Furosemide' },
      })
      fireEvent.change(screen.getByRole('combobox', { name: /risk level/i }), {
        target: { value: 'high' },
      })

      // Submit the form
      await user.click(screen.getByRole('button', { name: /create discharge/i }))

      // Wait for success notification to appear
      await waitFor(
        () => {
          expect(screen.getByText('Discharge created successfully.')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Advance timers by 5 seconds — notification should auto-dismiss
      act(() => {
        vi.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(screen.queryByText('Discharge created successfully.')).not.toBeInTheDocument()
      })
    },
    20000
  )
})
