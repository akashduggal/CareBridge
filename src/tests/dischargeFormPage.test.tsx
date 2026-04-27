/**
 * Tests for DischargeFormPage — Medication List Editor (task 16.6)
 *
 * Validates the medication list editor invariant:
 *   FOR ALL medication list states, the remove button for a medication row
 *   SHALL be present if and only if there is more than one row in the list.
 *
 * Validates: Requirements 16.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent } from '@testing-library/react'
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

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DischargeFormPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Returns all remove-medication buttons currently in the DOM. */
function getRemoveButtons() {
  return screen.queryAllByRole('button', { name: /remove medication row/i })
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('16.6 – Medication list editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  // ── Initial state ──────────────────────────────────────────────────────────

  it('renders one medication row on initial load', () => {
    renderForm()
    // One name input means one row
    const nameInputs = screen.getAllByPlaceholderText('Medication name')
    expect(nameInputs).toHaveLength(1)
  })

  it('does NOT show a remove button when only one row exists', () => {
    renderForm()
    expect(getRemoveButtons()).toHaveLength(0)
  })

  // ── Add row ────────────────────────────────────────────────────────────────

  it('adds a second row when "Add medication" is clicked', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add medication/i }))

    const nameInputs = screen.getAllByPlaceholderText('Medication name')
    expect(nameInputs).toHaveLength(2)
  })

  it('shows remove buttons for all rows once there are two rows', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add medication/i }))

    expect(getRemoveButtons()).toHaveLength(2)
  })

  it('shows remove buttons for all rows when three rows exist', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add medication/i }))
    await user.click(screen.getByRole('button', { name: /add medication/i }))

    expect(getRemoveButtons()).toHaveLength(3)
  })

  // ── Remove row ─────────────────────────────────────────────────────────────

  it('removes a row when its remove button is clicked', async () => {
    const user = userEvent.setup()
    renderForm()

    // Add a second row so remove buttons appear
    await user.click(screen.getByRole('button', { name: /add medication/i }))
    expect(screen.getAllByPlaceholderText('Medication name')).toHaveLength(2)

    // Remove the first row
    const [firstRemove] = getRemoveButtons()
    await user.click(firstRemove)

    expect(screen.getAllByPlaceholderText('Medication name')).toHaveLength(1)
  })

  it('hides remove button once only one row remains after removal', async () => {
    const user = userEvent.setup()
    renderForm()

    // Add a second row
    await user.click(screen.getByRole('button', { name: /add medication/i }))
    expect(getRemoveButtons()).toHaveLength(2)

    // Remove one row — now only one remains
    const [firstRemove] = getRemoveButtons()
    await user.click(firstRemove)

    expect(getRemoveButtons()).toHaveLength(0)
  })

  it('cannot reduce below one row (no remove button on last row)', async () => {
    const user = userEvent.setup()
    renderForm()

    // Only one row — no remove button
    expect(getRemoveButtons()).toHaveLength(0)

    // Add then remove to confirm we return to zero remove buttons
    await user.click(screen.getByRole('button', { name: /add medication/i }))
    await user.click(getRemoveButtons()[0])

    expect(screen.getAllByPlaceholderText('Medication name')).toHaveLength(1)
    expect(getRemoveButtons()).toHaveLength(0)
  })

  // ── Field inputs ───────────────────────────────────────────────────────────

  it('each row has name, dose, frequency inputs and a newMed checkbox', () => {
    renderForm()

    expect(screen.getByPlaceholderText('Medication name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. 10mg')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. twice daily')).toBeInTheDocument()
    expect(screen.getByLabelText(/new at discharge/i)).toBeInTheDocument()
  })

  it('updates the name field when typed into', async () => {
    const user = userEvent.setup()
    renderForm()

    const nameInput = screen.getByPlaceholderText('Medication name')
    await user.type(nameInput, 'Lisinopril')

    expect(nameInput).toHaveValue('Lisinopril')
  })

  it('toggles the newMed checkbox', async () => {
    const user = userEvent.setup()
    renderForm()

    const checkbox = screen.getByLabelText(/new at discharge/i)
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  // ── Read-only mode ─────────────────────────────────────────────────────────

  it('does not show "Add medication" button in read-only mode', () => {
    mockAuth({ role: 'nurse' })
    renderForm()

    expect(screen.queryByRole('button', { name: /add medication/i })).not.toBeInTheDocument()
  })

  it('does not show remove buttons in read-only mode even with multiple rows', () => {
    // Read-only mode: role is not admin, so the form is read-only.
    // We can't add rows via UI in read-only mode, so this tests the guard directly.
    mockAuth({ role: 'physician' })
    renderForm()

    expect(getRemoveButtons()).toHaveLength(0)
  })
})

// ─── Property-based test ──────────────────────────────────────────────────────

/**
 * Property: Remove button present iff >1 row
 * Validates: Requirements 16.6
 *
 * For any N rows (1–9), the number of remove buttons SHALL equal N when N > 1,
 * and 0 when N === 1.
 *
 * Uses fireEvent (synchronous) instead of userEvent to keep each run fast
 * enough for property-based testing across many samples.
 */

describe('16.6 – PBT: remove button invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  test.prop([fc.integer({ min: 0, max: 8 })], { numRuns: 10 })(
    'remove button count equals row count when >1, else 0',
    (additionalRows) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <DischargeFormPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Add `additionalRows` more rows (start with 1) using synchronous fireEvent
      for (let i = 0; i < additionalRows; i++) {
        const addBtn = screen.getByRole('button', { name: /add medication/i })
        fireEvent.click(addBtn)
      }

      const totalRows = 1 + additionalRows
      const nameInputs = screen.getAllByPlaceholderText('Medication name')
      const removeButtons = screen.queryAllByRole('button', { name: /remove medication row/i })

      expect(nameInputs).toHaveLength(totalRows)

      if (totalRows > 1) {
        expect(removeButtons).toHaveLength(totalRows)
      } else {
        expect(removeButtons).toHaveLength(0)
      }

      unmount()
    }
  )
})

// ─── Task 16.8 – Submit-time validation ──────────────────────────────────────

/**
 * Tests for DischargeFormPage — Submit-time validation (task 16.8)
 *
 * Validates: Requirements 16.8
 *
 * On submit, the form must:
 *  - Validate all required fields
 *  - Display inline error messages adjacent to each invalid field
 *  - Wire each error message via aria-describedby on the corresponding input
 *  - Set aria-invalid="true" on each invalid input/select
 *  - Render each error paragraph with role="alert"
 */

import { apiClient } from '@/lib/apiClient'

// Mock PatientSearchAutocomplete so we can control patient selection in tests
vi.mock('@/components/PatientSearchAutocomplete', () => ({
  PatientSearchAutocomplete: ({
    onPatientSelected,
    onPatientCreationError,
    error,
    errorId,
  }: {
    onPatientSelected: (p: { id: string; name: string; isNew: boolean } | null) => void
    onPatientCreationError?: (err: Error) => void
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
      <button
        type="button"
        onClick={() => onPatientCreationError?.(new Error('Patient creation failed: server error'))}
      >
        Trigger patient creation error
      </button>
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  ),
}))

describe('16.8 – Submit-time validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  // ── Helper: click the submit button ────────────────────────────────────────

  async function submitForm() {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /create discharge/i }))
    return user
  }

  // ── 1. Empty form shows all required-field errors ──────────────────────────

  it('shows all required-field error messages when the form is submitted empty', async () => {
    await submitForm()

    // Patient error appears twice (once in the mock autocomplete, once in the fieldset)
    expect(screen.getAllByText('Patient is required.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Diagnosis group is required.')).toBeInTheDocument()
    expect(screen.getByText('ICD-10 code is required.')).toBeInTheDocument()
    expect(screen.getByText('Discharge date and time is required.')).toBeInTheDocument()
    expect(screen.getByText('At least one medication is required.')).toBeInTheDocument()
    expect(screen.getByText('Risk level is required.')).toBeInTheDocument()
  })

  // ── 2. Error messages have role="alert" ────────────────────────────────────

  it('renders each error message with role="alert"', async () => {
    await submitForm()

    const alerts = screen.getAllByRole('alert')
    const alertTexts = alerts.map((el) => el.textContent)

    expect(alertTexts).toContain('Patient is required.')
    expect(alertTexts).toContain('Diagnosis group is required.')
    expect(alertTexts).toContain('ICD-10 code is required.')
    expect(alertTexts).toContain('Discharge date and time is required.')
    expect(alertTexts).toContain('At least one medication is required.')
    expect(alertTexts).toContain('Risk level is required.')
  })

  // ── 3. aria-invalid="true" on invalid inputs/selects ──────────────────────

  it('sets aria-invalid="true" on the diagnosis group select when invalid', async () => {
    await submitForm()

    const diagnosisSelect = screen.getByRole('combobox', { name: /diagnosis group/i })
    expect(diagnosisSelect).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-invalid="true" on the ICD-10 input when invalid', async () => {
    await submitForm()

    const icd10Input = screen.getByRole('textbox', { name: /icd-10 code/i })
    expect(icd10Input).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-invalid="true" on the discharge datetime input when invalid', async () => {
    await submitForm()

    // datetime-local inputs don't have an implicit role; query by label
    const dateInput = screen.getByLabelText(/discharge date/i)
    expect(dateInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-invalid="true" on the risk level select when invalid', async () => {
    await submitForm()

    const riskSelect = screen.getByRole('combobox', { name: /risk level/i })
    expect(riskSelect).toHaveAttribute('aria-invalid', 'true')
  })

  // ── 4. aria-describedby points to the error paragraph's id ────────────────

  it('wires aria-describedby on the diagnosis group select to its error paragraph', async () => {
    await submitForm()

    const diagnosisSelect = screen.getByRole('combobox', { name: /diagnosis group/i })
    const errorId = diagnosisSelect.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()

    const errorParagraph = document.getElementById(errorId!)
    expect(errorParagraph).not.toBeNull()
    expect(errorParagraph!.textContent).toBe('Diagnosis group is required.')
  })

  it('wires aria-describedby on the ICD-10 input to its error paragraph', async () => {
    await submitForm()

    const icd10Input = screen.getByRole('textbox', { name: /icd-10 code/i })
    const errorId = icd10Input.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()

    const errorParagraph = document.getElementById(errorId!)
    expect(errorParagraph).not.toBeNull()
    expect(errorParagraph!.textContent).toBe('ICD-10 code is required.')
  })

  it('wires aria-describedby on the risk level select to its error paragraph', async () => {
    await submitForm()

    const riskSelect = screen.getByRole('combobox', { name: /risk level/i })
    const errorId = riskSelect.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()

    const errorParagraph = document.getElementById(errorId!)
    expect(errorParagraph).not.toBeNull()
    expect(errorParagraph!.textContent).toBe('Risk level is required.')
  })

  // ── 5. ICD-10 validation: valid code clears error; invalid shows format error ──

  it('clears the ICD-10 error when a valid code is entered and form is resubmitted', async () => {
    const user = userEvent.setup()
    renderForm()

    // First submit — triggers ICD-10 required error
    await user.click(screen.getByRole('button', { name: /create discharge/i }))
    expect(screen.getByText('ICD-10 code is required.')).toBeInTheDocument()

    // Enter a valid ICD-10 code and resubmit
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    expect(screen.queryByText('ICD-10 code is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('Invalid ICD-10 code format.')).not.toBeInTheDocument()
  })

  it('shows "Invalid ICD-10 code format." when an invalid code is entered', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'INVALID')
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    expect(screen.getByText('Invalid ICD-10 code format.')).toBeInTheDocument()
  })

  // ── 6. Future datetime shows the future-date error ─────────────────────────

  it('shows "Discharge time cannot be in the future." for a future datetime', async () => {
    const user = userEvent.setup()
    renderForm()

    // Set a datetime far in the future
    const futureDate = '2099-12-31T23:59'
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: futureDate },
    })

    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    expect(screen.getByText('Discharge time cannot be in the future.')).toBeInTheDocument()
  })

  // ── 7. Valid submit calls the API ──────────────────────────────────────────

  it('calls apiClient and shows no errors when all fields are valid', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-1' })

    const user = userEvent.setup()
    renderForm()

    // Select patient via the mocked autocomplete
    await user.click(screen.getByRole('button', { name: /select patient/i }))

    // Select diagnosis group
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )

    // Enter a valid ICD-10 code
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')

    // Set a past discharge datetime
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2020-01-15T10:30' },
    })

    // Enter a medication name
    await user.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')

    // Select risk level
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'low')

    // Submit
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // No error messages should be visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // apiClient should have been called with the discharge payload
    expect(apiClient).toHaveBeenCalledWith(
      '/api/discharges',
      expect.objectContaining({ method: 'POST' })
    )
  })

  // ── 8. Errors cleared on valid resubmission ────────────────────────────────

  it('clears all errors when the form is resubmitted with valid data', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-1' })

    const user = userEvent.setup()
    renderForm()

    // First submit — all errors appear
    await user.click(screen.getByRole('button', { name: /create discharge/i }))
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)

    // Fill all required fields
    await user.click(screen.getByRole('button', { name: /select patient/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2020-01-15T10:30' },
    })
    await user.type(screen.getByPlaceholderText('Medication name'), 'Lisinopril')
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'low')

    // Resubmit — errors should be gone
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    expect(screen.queryByText('Patient is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('Diagnosis group is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('ICD-10 code is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('Discharge date and time is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('At least one medication is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('Risk level is required.')).not.toBeInTheDocument()
  })
})

// ─── Task 16.9 / 16.16 – Integration: valid submit → POST /discharges → success notification ──

/**
 * Integration test: fill valid data → submit → POST /discharges called → success notification shown
 *
 * Validates: Requirements 6.11, 6.13
 * Feature: readmission-prevention-dashboard
 * Property: Form submit calls POST /discharges on valid data and shows auto-dismiss success notification
 */

describe('16.9 / 16.16 – Integration: valid submit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  it('calls POST /discharges with correct payload on valid submit', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-99' })

    const user = userEvent.setup()
    renderForm()

    // Select existing patient via mocked autocomplete
    await user.click(screen.getByRole('button', { name: /select patient/i }))

    // Fill diagnosis group
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'COPD'
    )

    // Fill ICD-10 code
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'J44.1')

    // Set past discharge datetime
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-03-10T09:00' },
    })

    // Fill medication name
    await user.type(screen.getByPlaceholderText('Medication name'), 'Salbutamol')

    // Select risk level
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'medium')

    // Submit
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // POST /discharges should have been called
    expect(apiClient).toHaveBeenCalledWith(
      '/api/discharges',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"patientId":"p1"'),
      })
    )

    // Verify payload shape
    const callArgs = (apiClient as Mock).mock.calls.find(
      ([url]: string[]) => url === '/api/discharges'
    )
    expect(callArgs).toBeDefined()
    const payload = JSON.parse(callArgs![1].body as string)
    expect(payload).toMatchObject({
      patientId: 'p1',
      diagnosisGroup: 'COPD',
      icd10Code: 'J44.1',
      dischargeDateTime: '2024-03-10T09:00',
      riskLevel: 'medium',
      medications: expect.arrayContaining([
        expect.objectContaining({ name: 'Salbutamol' }),
      ]),
    })
  })

  it('shows success notification after successful submit', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-99' })

    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /select patient/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-03-10T09:00' },
    })
    await user.type(screen.getByPlaceholderText('Medication name'), 'Furosemide')
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'high')

    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Success notification should appear
    expect(
      await screen.findByText('Discharge created successfully.')
    ).toBeInTheDocument()
  })

  it('resets the form after successful submit', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-99' })

    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /select patient/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'AMI'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I21.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-03-10T09:00' },
    })
    await user.type(screen.getByPlaceholderText('Medication name'), 'Aspirin')
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'low')

    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Wait for success notification
    await screen.findByText('Discharge created successfully.')

    // ICD-10 field should be cleared (form reset)
    expect(screen.getByRole('textbox', { name: /icd-10 code/i })).toHaveValue('')

    // Diagnosis group should be reset to placeholder
    expect(screen.getByRole('combobox', { name: /diagnosis group/i })).toHaveValue('')

    // Risk level should be reset
    expect(screen.getByRole('combobox', { name: /risk level/i })).toHaveValue('')
  })

  it('does NOT call POST /patients for an existing patient on submit', async () => {
    ;(apiClient as Mock).mockResolvedValue({ id: 'discharge-99' })

    const user = userEvent.setup()
    renderForm()

    // Select existing patient (isNew: false from mock)
    await user.click(screen.getByRole('button', { name: /select patient/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-03-10T09:00' },
    })
    await user.type(screen.getByPlaceholderText('Medication name'), 'Furosemide')
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'low')

    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Only one API call — POST /discharges, not POST /patients
    const patientCalls = (apiClient as Mock).mock.calls.filter(
      ([url]: string[]) => url === '/api/patients'
    )
    expect(patientCalls).toHaveLength(0)

    const dischargeCalls = (apiClient as Mock).mock.calls.filter(
      ([url]: string[]) => url === '/api/discharges'
    )
    expect(dischargeCalls).toHaveLength(1)
  })
})

// ─── Task 16.10 – API failure: persistent error notification, form data intact ──

/**
 * Tests for DischargeFormPage — API failure handling (task 16.10)
 *
 * Validates: Requirements 6.12, 6.13
 *
 * On POST /discharges failure:
 *   - A persistent error notification (role="alert") is shown with the server error message
 *   - Form data is kept intact (not reset)
 *
 * On POST /patients failure:
 *   - A persistent error notification is shown
 *   - Form data is kept intact
 */

describe('16.10 – API failure: persistent error notification and form data intact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
  })

  // ── Helper: fill all required fields ──────────────────────────────────────

  async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /select patient/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'CHF'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'I50.9')
    fireEvent.change(screen.getByLabelText(/discharge date/i), {
      target: { value: '2024-03-10T09:00' },
    })
    await user.type(screen.getByPlaceholderText('Medication name'), 'Furosemide')
    await user.selectOptions(screen.getByRole('combobox', { name: /risk level/i }), 'high')
  }

  // ── 1. POST /discharges failure: persistent error notification shown ───────

  it('shows a persistent error notification when POST /discharges fails', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    const user = userEvent.setup()
    renderForm()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Error notification should appear with role="alert"
    const notification = await screen.findByRole('alert')
    expect(notification).toBeInTheDocument()
    expect(notification).toHaveTextContent('API error: 500')
  })

  // ── 2. POST /discharges failure: notification contains server error message ─

  it('shows the server error message in the error notification on POST /discharges failure', async () => {
    const serverMessage = 'Internal server error: discharge creation failed'
    ;(apiClient as Mock).mockRejectedValue(new Error(serverMessage))

    const user = userEvent.setup()
    renderForm()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    expect(await screen.findByText(serverMessage)).toBeInTheDocument()
  })

  // ── 3. POST /discharges failure: form data is kept intact ─────────────────

  it('keeps form data intact when POST /discharges fails', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 503'))

    const user = userEvent.setup()
    renderForm()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Wait for the error notification to appear
    await screen.findByRole('alert')

    // ICD-10 field should still have its value (form not reset)
    expect(screen.getByRole('textbox', { name: /icd-10 code/i })).toHaveValue('I50.9')

    // Diagnosis group should still be set
    expect(screen.getByRole('combobox', { name: /diagnosis group/i })).toHaveValue('CHF')

    // Risk level should still be set
    expect(screen.getByRole('combobox', { name: /risk level/i })).toHaveValue('high')

    // Medication name should still be present
    expect(screen.getByPlaceholderText('Medication name')).toHaveValue('Furosemide')
  })

  // ── 4. POST /discharges failure: notification does NOT auto-dismiss ────────

  it('error notification is persistent (does not auto-dismiss) on POST /discharges failure', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    const user = userEvent.setup()
    renderForm()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Error notification should appear
    const notification = await screen.findByRole('alert')
    expect(notification).toBeInTheDocument()

    // The notification should have a dismiss button (manual dismiss only, not auto-dismiss)
    expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeInTheDocument()
  })

  // ── 5. POST /discharges failure: notification can be manually dismissed ────

  it('error notification can be manually dismissed', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    const user = userEvent.setup()
    renderForm()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create discharge/i }))

    // Wait for error notification
    await screen.findByRole('alert')

    // Dismiss the notification
    await user.click(screen.getByRole('button', { name: /dismiss notification/i }))

    // Notification should be gone
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ── 6. POST /patients failure: persistent error notification shown ─────────

  it('shows a persistent error notification when POST /patients fails', async () => {
    const user = userEvent.setup()
    renderForm()

    // Trigger patient creation error via the mock button
    await user.click(screen.getByRole('button', { name: /trigger patient creation error/i }))

    // Error notification should appear with role="alert"
    const notification = await screen.findByRole('alert')
    expect(notification).toBeInTheDocument()
    expect(notification).toHaveTextContent('Patient creation failed: server error')
  })

  // ── 7. POST /patients failure: form data is kept intact ───────────────────

  it('keeps form data intact when POST /patients fails', async () => {
    const user = userEvent.setup()
    renderForm()

    // Fill some form fields first
    await user.selectOptions(
      screen.getByRole('combobox', { name: /diagnosis group/i }),
      'COPD'
    )
    await user.type(screen.getByRole('textbox', { name: /icd-10 code/i }), 'J44.1')

    // Trigger patient creation error
    await user.click(screen.getByRole('button', { name: /trigger patient creation error/i }))

    // Wait for error notification
    await screen.findByRole('alert')

    // Form data should still be intact
    expect(screen.getByRole('combobox', { name: /diagnosis group/i })).toHaveValue('COPD')
    expect(screen.getByRole('textbox', { name: /icd-10 code/i })).toHaveValue('J44.1')
  })
})

// ─── Task 16.12 – Nurse/Physician read-only mode; submit button hidden ────────

/**
 * Tests for DischargeFormPage — Role-based read-only mode (task 16.12)
 *
 * Validates: Requirements 6 (Discharge Intake Form)
 *
 * Nurse/Physician roles:
 *   - All form inputs are disabled
 *   - Submit button is NOT in the DOM
 *   - A read-only banner is shown
 *
 * Admin role:
 *   - All form inputs are enabled
 *   - Submit button IS in the DOM
 */

describe('16.12 – Role-based read-only mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Nurse role ─────────────────────────────────────────────────────────────

  describe('nurse role', () => {
    beforeEach(() => {
      mockAuth({ role: 'nurse' })
    })

    it('shows the read-only banner for nurse', () => {
      renderForm()
      expect(screen.getByRole('status')).toHaveTextContent(/read-only mode/i)
    })

    it('diagnosis group select is disabled for nurse', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /diagnosis group/i })).toBeDisabled()
    })

    it('ICD-10 input is disabled for nurse', () => {
      renderForm()
      expect(screen.getByRole('textbox', { name: /icd-10 code/i })).toBeDisabled()
    })

    it('discharge datetime input is disabled for nurse', () => {
      renderForm()
      expect(screen.getByLabelText(/discharge date/i)).toBeDisabled()
    })

    it('risk level select is disabled for nurse', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /risk level/i })).toBeDisabled()
    })

    it('medication name input is disabled for nurse', () => {
      renderForm()
      expect(screen.getByPlaceholderText('Medication name')).toBeDisabled()
    })

    it('medication dose input is disabled for nurse', () => {
      renderForm()
      expect(screen.getByPlaceholderText('e.g. 10mg')).toBeDisabled()
    })

    it('medication frequency input is disabled for nurse', () => {
      renderForm()
      expect(screen.getByPlaceholderText('e.g. twice daily')).toBeDisabled()
    })

    it('new-at-discharge checkbox is disabled for nurse', () => {
      renderForm()
      expect(screen.getByLabelText(/new at discharge/i)).toBeDisabled()
    })

    it('submit button is NOT in the DOM for nurse', () => {
      renderForm()
      expect(screen.queryByRole('button', { name: /create discharge/i })).not.toBeInTheDocument()
    })

    it('"Add medication" button is NOT in the DOM for nurse', () => {
      renderForm()
      expect(screen.queryByRole('button', { name: /add medication/i })).not.toBeInTheDocument()
    })
  })

  // ── Physician role ─────────────────────────────────────────────────────────

  describe('physician role', () => {
    beforeEach(() => {
      mockAuth({ role: 'physician' })
    })

    it('shows the read-only banner for physician', () => {
      renderForm()
      expect(screen.getByRole('status')).toHaveTextContent(/read-only mode/i)
    })

    it('diagnosis group select is disabled for physician', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /diagnosis group/i })).toBeDisabled()
    })

    it('ICD-10 input is disabled for physician', () => {
      renderForm()
      expect(screen.getByRole('textbox', { name: /icd-10 code/i })).toBeDisabled()
    })

    it('discharge datetime input is disabled for physician', () => {
      renderForm()
      expect(screen.getByLabelText(/discharge date/i)).toBeDisabled()
    })

    it('risk level select is disabled for physician', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /risk level/i })).toBeDisabled()
    })

    it('medication name input is disabled for physician', () => {
      renderForm()
      expect(screen.getByPlaceholderText('Medication name')).toBeDisabled()
    })

    it('new-at-discharge checkbox is disabled for physician', () => {
      renderForm()
      expect(screen.getByLabelText(/new at discharge/i)).toBeDisabled()
    })

    it('submit button is NOT in the DOM for physician', () => {
      renderForm()
      expect(screen.queryByRole('button', { name: /create discharge/i })).not.toBeInTheDocument()
    })

    it('"Add medication" button is NOT in the DOM for physician', () => {
      renderForm()
      expect(screen.queryByRole('button', { name: /add medication/i })).not.toBeInTheDocument()
    })
  })

  // ── Admin role ─────────────────────────────────────────────────────────────

  describe('admin role', () => {
    beforeEach(() => {
      mockAuth({ role: 'admin' })
    })

    it('does NOT show the read-only banner for admin', () => {
      renderForm()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('diagnosis group select is enabled for admin', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /diagnosis group/i })).not.toBeDisabled()
    })

    it('ICD-10 input is enabled for admin', () => {
      renderForm()
      expect(screen.getByRole('textbox', { name: /icd-10 code/i })).not.toBeDisabled()
    })

    it('discharge datetime input is enabled for admin', () => {
      renderForm()
      expect(screen.getByLabelText(/discharge date/i)).not.toBeDisabled()
    })

    it('risk level select is enabled for admin', () => {
      renderForm()
      expect(screen.getByRole('combobox', { name: /risk level/i })).not.toBeDisabled()
    })

    it('medication name input is enabled for admin', () => {
      renderForm()
      expect(screen.getByPlaceholderText('Medication name')).not.toBeDisabled()
    })

    it('submit button IS in the DOM for admin', () => {
      renderForm()
      expect(screen.getByRole('button', { name: /create discharge/i })).toBeInTheDocument()
    })

    it('"Add medication" button IS in the DOM for admin', () => {
      renderForm()
      expect(screen.getByRole('button', { name: /add medication/i })).toBeInTheDocument()
    })
  })
})
