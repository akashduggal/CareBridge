import { useState, useRef, useId, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { useDebounce } from '@/hooks/useDebounce'
import type { ApiResponse, Patient } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectedPatient {
  id: string
  name: string
  isNew: boolean
}

interface CreatePatientPayload {
  name: string
  dateOfBirth: string
}

interface PatientSearchAutocompleteProps {
  /** Called when a patient is selected (existing or newly created) */
  onPatientSelected: (patient: SelectedPatient | null) => void
  /** Currently selected patient (controlled) */
  value: SelectedPatient | null
  /** Whether the component is disabled (read-only mode) */
  disabled?: boolean
  /** Error message to display */
  error?: string
  /** ID for aria-describedby on the error message */
  errorId?: string
  /** Called when POST /patients fails, so the parent can show a page-level error notification */
  onPatientCreationError?: (error: Error) => void
}

const DEBOUNCE_MS = 300

// ─── PatientSearchAutocomplete ────────────────────────────────────────────────

export function PatientSearchAutocomplete({
  onPatientSelected,
  value,
  disabled = false,
  error,
  errorId,
  onPatientCreationError,
}: PatientSearchAutocompleteProps) {
  const inputId = useId()
  const listboxId = useId()
  const newPatientSectionId = useId()
  const newPatientErrorId = useId()

  const [inputValue, setInputValue] = useState(value?.name ?? '')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [showNewPatientForm, setShowNewPatientForm] = useState(false)
  const [newPatientDob, setNewPatientDob] = useState('')
  const [newPatientError, setNewPatientError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const showNewPatientFormRef = useRef(false)

  const debouncedSearch = useDebounce(inputValue, DEBOUNCE_MS)

  // Only search when there's input and no patient is already selected
  const shouldSearch = debouncedSearch.trim().length > 0 && !value

  const { data, isFetching } = useQuery<ApiResponse<Patient[]>>({
    queryKey: queryKeys.patients({ search: debouncedSearch }),
    queryFn: () =>
      apiClient<ApiResponse<Patient[]>>(
        `/api/patients?search=${encodeURIComponent(debouncedSearch)}`
      ),
    enabled: shouldSearch,
  })

  const createPatientMutation = useMutation<Patient, Error, CreatePatientPayload>({
    mutationFn: (payload) =>
      apiClient<Patient>('/api/patients', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })

  const patients = data?.data ?? []

  // Total options: existing patients + "Add new patient" option (if search text non-empty)
  const hasAddNewOption = inputValue.trim().length > 0 && !value
  const totalOptions = patients.length + (hasAddNewOption ? 1 : 0)
  const addNewIndex = patients.length // index of the "Add new patient" option

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openDropdown = useCallback(() => {
    if (!disabled && inputValue.trim().length > 0) {
      setIsOpen(true)
    }
  }, [disabled, inputValue])

  const closeDropdown = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVal = e.target.value
    setInputValue(newVal)
    // Clear selection when user types
    if (value) {
      onPatientSelected(null)
    }
    setShowNewPatientForm(false)
    setNewPatientError(null)
    if (newVal.trim().length > 0) {
      setIsOpen(true)
      setActiveIndex(-1)
    } else {
      setIsOpen(false)
    }
  }

  function handleSelectExisting(patient: Patient) {
    setInputValue(patient.name)
    setIsOpen(false)
    setActiveIndex(-1)
    setShowNewPatientForm(false)
    onPatientSelected({ id: patient.id, name: patient.name, isNew: false })
  }

  function handleSelectAddNew() {
    setIsOpen(false)
    setActiveIndex(-1)
    setShowNewPatientForm(true)
    showNewPatientFormRef.current = true
    setNewPatientDob('')
    setNewPatientError(null)
  }

  function handleConfirmNewPatient() {
    const name = inputValue.trim()
    if (!name) {
      setNewPatientError('Patient name is required.')
      return
    }
    setNewPatientError(null)
    createPatientMutation.mutate(
      { name, dateOfBirth: newPatientDob },
      {
        onSuccess: (created) => {
          setShowNewPatientForm(false)
          showNewPatientFormRef.current = false
          onPatientSelected({ id: created.id, name: created.name, isNew: true })
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Failed to create patient.'
          setNewPatientError(msg)
          onPatientCreationError?.(err instanceof Error ? err : new Error(msg))
        },
      }
    )
  }

  function handleCancelNewPatient() {
    setShowNewPatientForm(false)
    showNewPatientFormRef.current = false
    setNewPatientError(null)
    setNewPatientDob('')
    onPatientSelected(null)
  }

  function handleClearSelection() {
    setInputValue('')
    setIsOpen(false)
    setActiveIndex(-1)
    setShowNewPatientForm(false)
    setNewPatientError(null)
    onPatientSelected(null)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && inputValue.trim().length > 0) {
        setIsOpen(true)
        setActiveIndex(0)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % totalOptions)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((prev) => (prev <= 0 ? totalOptions - 1 : prev - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < patients.length) {
          handleSelectExisting(patients[activeIndex])
        } else if (activeIndex === addNewIndex && hasAddNewOption) {
          handleSelectAddNew()
        }
        break
      case 'Escape':
        e.preventDefault()
        closeDropdown()
        inputRef.current?.focus()
        break
      case 'Tab':
        closeDropdown()
        break
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Use setTimeout to defer the close check, allowing focus to settle
    // This prevents premature closing when focus moves between elements within the component
    const currentTarget = e.currentTarget
    setTimeout(() => {
      // If focus is still within the component, don't close
      if (currentTarget.contains(document.activeElement)) {
        return
      }
      // Don't close if the new patient form is showing (use ref to avoid stale closure)
      if (showNewPatientFormRef.current) {
        return
      }
      closeDropdown()
    }, 0)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const showDropdown = isOpen && !disabled && (patients.length > 0 || hasAddNewOption)
  const isPatientSelected = !!value && !value.isNew

  return (
    <div className="relative" onBlur={handleBlur}>
      {/* Combobox input */}
      <div className="relative">
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Search patient <span aria-hidden="true">*</span>
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls={showDropdown ? listboxId : undefined}
            aria-activedescendant={
              activeIndex >= 0 && showDropdown
                ? activeIndex < patients.length
                  ? `${listboxId}-option-${activeIndex}`
                  : `${listboxId}-add-new`
                : undefined
            }
            aria-describedby={error && errorId ? errorId : undefined}
            aria-invalid={!!error}
            aria-required="true"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={openDropdown}
            disabled={disabled}
            placeholder="Type patient name to search…"
            autoComplete="off"
            className={[
              'w-full rounded-md border px-3 py-2 pr-8 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
              disabled ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
            ].join(' ')}
          />

          {/* Clear button when a patient is selected */}
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClearSelection}
              aria-label="Clear patient selection"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Loading indicator */}
          {isFetching && !disabled && (
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Searching…"
            >
              <svg
                className="h-4 w-4 animate-spin text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </span>
          )}
        </div>

        {/* Selected patient badge */}
        {isPatientSelected && (
          <p className="mt-1 text-xs text-green-700" role="status">
            ✓ Patient selected: <strong>{value.name}</strong>
          </p>
        )}
      </div>

      {/* Dropdown listbox */}
      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Patient search results"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {patients.map((patient, idx) => (
            <li
              key={patient.id}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onMouseDown={(e) => {
                e.preventDefault() // prevent blur before click
                handleSelectExisting(patient)
              }}
              className={[
                'cursor-pointer px-3 py-2 text-sm',
                activeIndex === idx
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-900 hover:bg-blue-50',
              ].join(' ')}
            >
              <span className="font-medium">{patient.name}</span>
              {patient.dateOfBirth && (
                <span
                  className={[
                    'ml-2 text-xs',
                    activeIndex === idx ? 'text-blue-100' : 'text-gray-500',
                  ].join(' ')}
                >
                  DOB: {patient.dateOfBirth}
                </span>
              )}
            </li>
          ))}

          {/* "Add new patient" option */}
          {hasAddNewOption && (
            <li
              id={`${listboxId}-add-new`}
              role="option"
              aria-selected={activeIndex === addNewIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelectAddNew()
              }}
              className={[
                'cursor-pointer border-t border-gray-100 px-3 py-2 text-sm',
                activeIndex === addNewIndex
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-600 hover:bg-blue-50',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add new patient: <strong className="ml-0.5">{inputValue.trim()}</strong>
              </span>
            </li>
          )}
        </ul>
      )}

      {/* Inline new patient creation form */}
      {showNewPatientForm && !isPatientSelected && (
        <div
          id={newPatientSectionId}
          className="mt-2 space-y-3 rounded-md border border-dashed border-blue-300 bg-blue-50 p-3"
          role="group"
          aria-label="New patient details"
        >
          <p className="text-xs font-semibold text-blue-700">
            Creating new patient: <strong>{inputValue.trim()}</strong>
          </p>

          {/* Date of birth */}
          <div>
            <label
              htmlFor={`${inputId}-dob`}
              className="mb-1 block text-xs font-medium text-gray-700"
            >
              Date of birth
            </label>
            <input
              id={`${inputId}-dob`}
              type="date"
              value={newPatientDob}
              onChange={(e) => setNewPatientDob(e.target.value)}
              disabled={createPatientMutation.isPending}
              aria-describedby={newPatientError ? newPatientErrorId : undefined}
              aria-invalid={!!newPatientError}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>

          {/* Mutation error */}
          {newPatientError && (
            <p id={newPatientErrorId} role="alert" className="text-xs text-red-600">
              {newPatientError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmNewPatient}
              disabled={createPatientMutation.isPending}
              aria-busy={createPatientMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createPatientMutation.isPending ? 'Creating…' : 'Confirm new patient'}
            </button>
            <button
              type="button"
              onClick={handleCancelNewPatient}
              disabled={createPatientMutation.isPending}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New patient confirmed badge */}
      {value?.isNew && (
        <p className="mt-1 text-xs text-blue-700" role="status">
          ✓ New patient will be created: <strong>{value.name}</strong>
        </p>
      )}
    </div>
  )
}
