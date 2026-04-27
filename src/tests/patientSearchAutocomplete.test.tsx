/**
 * Tests for PatientSearchAutocomplete (task 16.2)
 *
 * Covers:
 * - Renders a labeled text input (WCAG 2.1 AA)
 * - Debounces search query (300ms) and calls GET /patients?search=<query>
 * - Shows dropdown list of matching patients
 * - Allows selecting an existing patient
 * - Shows "Add new patient: [name]" option when search text is non-empty
 * - Inline new patient creation form (name + date of birth)
 * - Calls POST /patients when confirming new patient
 * - Exposes selected/created patient to parent via onPatientSelected
 * - WCAG: label, keyboard navigation (arrow keys, Enter, Escape), aria-expanded,
 *   aria-autocomplete, role="combobox", role="listbox", role="option"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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

import { apiClient } from '@/lib/apiClient'
import { PatientSearchAutocomplete } from '@/components/PatientSearchAutocomplete'
import type { Mock } from 'vitest'
import type { ApiResponse, Patient } from '@/types'
import type { SelectedPatient } from '@/components/PatientSearchAutocomplete'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    name: 'Jane Doe',
    dateOfBirth: '1980-03-15',
    ...overrides,
  }
}

function makeApiResponse(patients: Patient[]): ApiResponse<Patient[]> {
  return { data: patients, meta: { page: 1, limit: 25, total: patients.length } }
}

interface RenderOptions {
  value?: SelectedPatient | null
  disabled?: boolean
  error?: string
  errorId?: string
}

function renderComponent(
  onPatientSelected: Mock = vi.fn(),
  options: RenderOptions = {}
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { value = null, disabled = false, error, errorId } = options

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PatientSearchAutocomplete
          value={value}
          onPatientSelected={onPatientSelected}
          disabled={disabled}
          error={error}
          errorId={errorId}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Accessibility: label and ARIA attributes ─────────────────────────────────

describe('WCAG 2.1 AA – label and ARIA attributes', () => {
  it('renders a visible label associated with the input', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    // The label text should be present
    expect(screen.getByText(/search patient/i)).toBeInTheDocument()
    // The input should be accessible via its label
    const input = screen.getByRole('combobox')
    expect(input).toBeInTheDocument()
  })

  it('input has role="combobox"', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('input has aria-autocomplete="list"', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('aria-expanded is false when dropdown is closed', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('aria-expanded is true when dropdown is open', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([makePatient({ name: 'Alice Smith' })])
    )

    const user = userEvent.setup()
    renderComponent()

    const input = screen.getByRole('combobox')
    await user.type(input, 'Alice')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('listbox has role="listbox"', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([makePatient({ name: 'Alice Smith' })])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })
  })

  it('each patient option has role="option"', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([
        makePatient({ name: 'Alice Smith' }),
        makePatient({ name: 'Bob Jones' }),
      ])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      // At least 2 patient options + 1 "add new" option
      expect(options.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('input is disabled when disabled prop is true', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent(vi.fn(), { disabled: true })

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('shows aria-invalid when error prop is provided', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent(vi.fn(), { error: 'Patient is required.', errorId: 'patient-error' })

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })
})

// ─── Search behavior ──────────────────────────────────────────────────────────

describe('Search behavior', () => {
  it('does not call GET /patients on initial render (no input)', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    expect(apiClient).not.toHaveBeenCalled()
  })

  it('calls GET /patients?search=<query> after typing (debounced)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(
      () => {
        expect(apiClient).toHaveBeenCalledWith(
          expect.stringContaining('search=Alice')
        )
      },
      { timeout: 2000 }
    )
  })

  it('shows matching patients in the dropdown', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([
        makePatient({ name: 'Alice Smith' }),
        makePatient({ name: 'Alice Johnson' }),
      ])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })
  })

  it('shows "Add new patient" option when search text is non-empty', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })
  })

  it('does NOT show "Add new patient" option when input is empty', () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))
    renderComponent()

    expect(screen.queryByText(/add new patient/i)).not.toBeInTheDocument()
  })

  it('closes dropdown when input is cleared', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([makePatient({ name: 'Alice Smith' })])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await user.clear(screen.getByRole('combobox'))

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })
})

// ─── Debounce timing ──────────────────────────────────────────────────────────

describe('Debounce timing (300ms)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('does NOT fire search before 300ms', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderComponent()

    const input = screen.getByRole('combobox')

    act(() => {
      fireEvent.change(input, { target: { value: 'A' } })
    })

    act(() => { vi.advanceTimersByTime(299) })

    const calls = (apiClient as Mock).mock.calls as [string][]
    const searchCalls = calls.filter(([url]) => (url as string).includes('search='))
    expect(searchCalls).toHaveLength(0)
  })

  it('fires search after 300ms', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderComponent()

    const input = screen.getByRole('combobox')

    act(() => {
      fireEvent.change(input, { target: { value: 'Alice' } })
    })

    act(() => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalledWith(
        expect.stringContaining('search=Alice')
      )
    })
  })
})

// ─── Selecting an existing patient ───────────────────────────────────────────

describe('Selecting an existing patient', () => {
  it('calls onPatientSelected with the patient data when a patient is clicked', async () => {
    const patient = makePatient({ id: 'p-123', name: 'Alice Smith' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([patient]))

    const onPatientSelected = vi.fn()
    const user = userEvent.setup()
    renderComponent(onPatientSelected)

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    // Click the patient option
    fireEvent.mouseDown(screen.getByRole('option', { name: /alice smith/i }))

    expect(onPatientSelected).toHaveBeenCalledWith({
      id: 'p-123',
      name: 'Alice Smith',
      isNew: false,
    })
  })

  it('closes the dropdown after selecting a patient', async () => {
    const patient = makePatient({ name: 'Alice Smith' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([patient]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    // Wait for the patient option to appear (query must resolve)
    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /alice smith/i })).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    fireEvent.mouseDown(screen.getByRole('option', { name: /alice smith/i }))

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('shows a confirmation status when a patient is selected', async () => {
    const patient = makePatient({ id: 'p-123', name: 'Alice Smith' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([patient]))

    renderComponent(vi.fn(), {
      value: { id: 'p-123', name: 'Alice Smith', isNew: false },
    })

    expect(screen.getByRole('status')).toHaveTextContent(/patient selected.*alice smith/i)
  })

  it('shows a clear button when a patient is selected', () => {
    renderComponent(vi.fn(), {
      value: { id: 'p-123', name: 'Alice Smith', isNew: false },
    })

    expect(screen.getByRole('button', { name: /clear patient selection/i })).toBeInTheDocument()
  })

  it('calls onPatientSelected(null) when clear button is clicked', async () => {
    const onPatientSelected = vi.fn()
    const user = userEvent.setup()

    renderComponent(onPatientSelected, {
      value: { id: 'p-123', name: 'Alice Smith', isNew: false },
    })

    await user.click(screen.getByRole('button', { name: /clear patient selection/i }))

    expect(onPatientSelected).toHaveBeenCalledWith(null)
  })
})

// ─── Keyboard navigation ──────────────────────────────────────────────────────

describe('Keyboard navigation', () => {
  it('ArrowDown opens the dropdown and focuses first option', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([makePatient({ name: 'Alice Smith' })])
    )

    const user = userEvent.setup()
    renderComponent()

    const input = screen.getByRole('combobox')
    await user.type(input, 'Alice')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    // Press ArrowDown to move to first option
    await user.keyboard('{ArrowDown}')

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter selects the focused option', async () => {
    const patient = makePatient({ id: 'p-123', name: 'Alice Smith' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([patient]))

    const onPatientSelected = vi.fn()
    const user = userEvent.setup()
    renderComponent(onPatientSelected)

    const input = screen.getByRole('combobox')
    await user.type(input, 'Alice')

    // Wait for the patient option to appear (query must resolve)
    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /alice smith/i })).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    // Navigate to first option and select
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(onPatientSelected).toHaveBeenCalledWith({
      id: 'p-123',
      name: 'Alice Smith',
      isNew: false,
    })
  })

  it('Escape closes the dropdown', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([makePatient({ name: 'Alice Smith' })])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'Alice')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('ArrowUp wraps around to the last option', async () => {
    ;(apiClient as Mock).mockResolvedValue(
      makeApiResponse([
        makePatient({ name: 'Alice Smith' }),
        makePatient({ name: 'Bob Jones' }),
      ])
    )

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'test')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    // ArrowDown to first, then ArrowUp should wrap to last
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowUp}')

    const options = screen.getAllByRole('option')
    // Last option should be selected (wraps around)
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
  })
})

// ─── Inline new patient creation ──────────────────────────────────────────────

describe('Inline new patient creation', () => {
  it('shows inline form when "Add new patient" option is selected', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /new patient details/i })).toBeInTheDocument()
    })
  })

  it('inline form has a date of birth input with associated label', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument()
    })
  })

  it('calls POST /patients when "Confirm new patient" is clicked', async () => {
    const createdPatient = makePatient({ id: 'new-p-1', name: 'NewPerson' })
    ;(apiClient as Mock).mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createdPatient)
      }
      return Promise.resolve(makeApiResponse([]))
    })

    const onPatientSelected = vi.fn()
    const user = userEvent.setup()
    renderComponent(onPatientSelected)

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /new patient details/i })).toBeInTheDocument()
    })

    // Fill in date of birth
    const dobInput = screen.getByLabelText(/date of birth/i)
    await user.type(dobInput, '1990-01-15')

    // Click confirm
    await user.click(screen.getByRole('button', { name: /confirm new patient/i }))

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalledWith(
        '/api/patients',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('calls onPatientSelected with isNew=true after successful patient creation', async () => {
    const createdPatient = makePatient({ id: 'new-p-1', name: 'NewPerson' })
    ;(apiClient as Mock).mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve(createdPatient)
      }
      return Promise.resolve(makeApiResponse([]))
    })

    const onPatientSelected = vi.fn()
    const user = userEvent.setup()
    renderComponent(onPatientSelected)

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm new patient/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /confirm new patient/i }))

    await waitFor(() => {
      expect(onPatientSelected).toHaveBeenCalledWith({
        id: 'new-p-1',
        name: 'NewPerson',
        isNew: true,
      })
    })
  })

  it('shows error message when POST /patients fails', async () => {
    ;(apiClient as Mock).mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.reject(new Error('Server error'))
      }
      return Promise.resolve(makeApiResponse([]))
    })

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm new patient/i })).toBeInTheDocument()
    })

    // Use fireEvent.click to avoid focus-related side effects in jsdom
    fireEvent.click(screen.getByRole('button', { name: /confirm new patient/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('hides inline form when Cancel is clicked', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const user = userEvent.setup()
    renderComponent()

    await user.type(screen.getByRole('combobox'), 'NewPerson')

    await waitFor(() => {
      expect(screen.getByText(/add new patient/i)).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText(/add new patient/i).closest('[role="option"]')!)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: /new patient details/i })).not.toBeInTheDocument()
    })
  })

  it('shows confirmation status for new patient after creation', async () => {
    renderComponent(vi.fn(), {
      value: { id: 'new-p-1', name: 'NewPerson', isNew: true },
    })

    expect(screen.getByRole('status')).toHaveTextContent(/new patient will be created.*newperson/i)
  })
})
