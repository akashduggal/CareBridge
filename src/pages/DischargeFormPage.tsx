import { useState, useId } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { validateICD10 } from '@/utils/validationUtils'
import { Notification } from '@/components/Notification'
import { PatientSearchAutocomplete } from '@/components/PatientSearchAutocomplete'
import type { SelectedPatient } from '@/components/PatientSearchAutocomplete'
import type { DiagnosisGroup, Medication, Discharge } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const DIAGNOSIS_GROUPS: DiagnosisGroup[] = ['CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER']
const RISK_LEVELS = ['low', 'medium', 'high'] as const
type RiskLevel = (typeof RISK_LEVELS)[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the current local datetime formatted as "YYYY-MM-DDTHH:mm",
 * suitable for use as the `max` attribute on a datetime-local input.
 */
function getCurrentDateTimeLocal(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  )
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface MedicationRow extends Medication {
  _key: string // stable row identity
}

interface FormState {
  selectedPatient: SelectedPatient | null
  diagnosisGroup: DiagnosisGroup | ''
  icd10Code: string
  dischargeDateTime: string
  medications: MedicationRow[]
  riskLevel: RiskLevel | ''
}

interface FormErrors {
  patient?: string
  diagnosisGroup?: string
  icd10Code?: string
  dischargeDateTime?: string
  medications?: string
  riskLevel?: string
}

function makeEmptyMedRow(): MedicationRow {
  return {
    _key: crypto.randomUUID(),
    name: '',
    dose: '',
    frequency: '',
    newMed: false,
  }
}

const INITIAL_FORM: FormState = {
  selectedPatient: null,
  diagnosisGroup: '',
  icd10Code: '',
  dischargeDateTime: '',
  medications: [makeEmptyMedRow()],
  riskLevel: '',
}

// ─── API payload types ────────────────────────────────────────────────────────

interface CreateDischargePayload {
  patientId: string
  diagnosisGroup: DiagnosisGroup
  icd10Code: string
  dischargeDateTime: string
  medications: Medication[]
  riskLevel: RiskLevel
}

// ─── DischargeFormPage ────────────────────────────────────────────────────────

export function DischargeFormPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const isReadOnly = role !== 'admin'

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [notification, setNotification] = useState<{
    message: string
    variant: 'status' | 'error'
  } | null>(null)

  // Stable IDs for aria-describedby
  const patientErrorId = useId()
  const diagnosisErrorId = useId()
  const icd10ErrorId = useId()
  const dateTimeErrorId = useId()
  const medicationsErrorId = useId()
  const riskLevelErrorId = useId()

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createDischargeMutation = useMutation<Discharge, Error, CreateDischargePayload>({
    mutationFn: (payload) =>
      apiClient<Discharge>('/api/discharges', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): FormErrors {
    const errs: FormErrors = {}

    // Patient required
    if (!form.selectedPatient) {
      errs.patient = 'Patient is required.'
    }

    // Diagnosis group required
    if (!form.diagnosisGroup) {
      errs.diagnosisGroup = 'Diagnosis group is required.'
    }

    // ICD-10 required and valid
    if (!form.icd10Code.trim()) {
      errs.icd10Code = 'ICD-10 code is required.'
    } else if (!validateICD10(form.icd10Code.trim())) {
      errs.icd10Code = 'Invalid ICD-10 code format.'
    }

    // Discharge datetime required and not in the future
    if (!form.dischargeDateTime) {
      errs.dischargeDateTime = 'Discharge date and time is required.'
    } else if (new Date(form.dischargeDateTime) > new Date()) {
      errs.dischargeDateTime = 'Discharge time cannot be in the future.'
    }

    // At least one medication with a name
    const validMeds = form.medications.filter((m) => m.name.trim())
    if (validMeds.length === 0) {
      errs.medications = 'At least one medication is required.'
    }

    // Risk level required
    if (!form.riskLevel) {
      errs.riskLevel = 'Risk level is required.'
    }

    return errs
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isReadOnly) return

    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})

    try {
      const resolvedPatientId = form.selectedPatient!.id

      const medications: Medication[] = form.medications
        .filter((m) => m.name.trim())
        .map(({ _key: _k, ...med }) => med)

      await createDischargeMutation.mutateAsync({
        patientId: resolvedPatientId,
        diagnosisGroup: form.diagnosisGroup as DiagnosisGroup,
        icd10Code: form.icd10Code.trim(),
        dischargeDateTime: form.dischargeDateTime,
        medications,
        riskLevel: form.riskLevel as RiskLevel,
      })

      setNotification({ message: 'Discharge created successfully.', variant: 'status' })
      setForm(INITIAL_FORM)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      setNotification({ message, variant: 'error' })
      // Form data is kept intact on error (no reset)
    }
  }

  // ── Medication helpers ─────────────────────────────────────────────────────

  function addMedication() {
    setForm((f) => ({ ...f, medications: [...f.medications, makeEmptyMedRow()] }))
  }

  function removeMedication(key: string) {
    setForm((f) => ({
      ...f,
      medications: f.medications.filter((m) => m._key !== key),
    }))
  }

  function updateMedication(key: string, field: keyof Omit<MedicationRow, '_key'>, value: string | boolean) {
    setForm((f) => ({
      ...f,
      medications: f.medications.map((m) =>
        m._key === key ? { ...m, [field]: value } : m
      ),
    }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isSubmitting = createDischargeMutation.isPending

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">New Discharge</h1>

      {isReadOnly && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          You are viewing this form in read-only mode.
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 w-80">
          <Notification
            message={notification.message}
            variant={notification.variant}
            onDismiss={() => setNotification(null)}
          />
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-label="New discharge form"
        className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {/* ── Patient ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">Patient</legend>

          <PatientSearchAutocomplete
            value={form.selectedPatient}
            onPatientSelected={(patient) =>
              setForm((f) => ({ ...f, selectedPatient: patient }))
            }
            disabled={isReadOnly}
            error={errors.patient}
            errorId={patientErrorId}
            onPatientCreationError={(err) => {
              const message = err.message || 'Patient creation failed.'
              setNotification({ message, variant: 'error' })
            }}
          />

          {errors.patient && (
            <p id={patientErrorId} role="alert" className="mt-1 text-xs text-red-600">
              {errors.patient}
            </p>
          )}
        </fieldset>

        {/* ── Diagnosis Group ── */}
        <div>
          <label
            htmlFor="diagnosis-group"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Diagnosis group <span aria-hidden="true">*</span>
          </label>
          <select
            id="diagnosis-group"
            value={form.diagnosisGroup}
            onChange={(e) =>
              setForm((f) => ({ ...f, diagnosisGroup: e.target.value as DiagnosisGroup | '' }))
            }
            disabled={isReadOnly}
            required
            aria-required="true"
            aria-describedby={errors.diagnosisGroup ? diagnosisErrorId : undefined}
            aria-invalid={!!errors.diagnosisGroup}
            className={[
              'w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              errors.diagnosisGroup ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
              isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
            ].join(' ')}
          >
            <option value="">Select diagnosis group…</option>
            {DIAGNOSIS_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {errors.diagnosisGroup && (
            <p id={diagnosisErrorId} role="alert" className="mt-1 text-xs text-red-600">
              {errors.diagnosisGroup}
            </p>
          )}
        </div>

        {/* ── ICD-10 Code ── */}
        <div>
          <label
            htmlFor="icd10-code"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            ICD-10 code <span aria-hidden="true">*</span>
          </label>
          <input
            id="icd10-code"
            type="text"
            value={form.icd10Code}
            onChange={(e) => setForm((f) => ({ ...f, icd10Code: e.target.value }))}
            placeholder="e.g. I50.9"
            disabled={isReadOnly}
            required
            aria-required="true"
            aria-describedby={errors.icd10Code ? icd10ErrorId : undefined}
            aria-invalid={!!errors.icd10Code}
            className={[
              'w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              errors.icd10Code ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
              isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
            ].join(' ')}
          />
          {errors.icd10Code && (
            <p id={icd10ErrorId} role="alert" className="mt-1 text-xs text-red-600">
              {errors.icd10Code}
            </p>
          )}
        </div>

        {/* ── Discharge Date/Time ── */}
        <div>
          <label
            htmlFor="discharge-datetime"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Discharge date &amp; time <span aria-hidden="true">*</span>
          </label>
          <input
            id="discharge-datetime"
            type="datetime-local"
            value={form.dischargeDateTime}
            max={getCurrentDateTimeLocal()}
            onChange={(e) => setForm((f) => ({ ...f, dischargeDateTime: e.target.value }))}
            disabled={isReadOnly}
            required
            aria-required="true"
            aria-describedby={errors.dischargeDateTime ? dateTimeErrorId : undefined}
            aria-invalid={!!errors.dischargeDateTime}
            className={[
              'w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              errors.dischargeDateTime ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
              isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
            ].join(' ')}
          />
          {errors.dischargeDateTime && (
            <p id={dateTimeErrorId} role="alert" className="mt-1 text-xs text-red-600">
              {errors.dischargeDateTime}
            </p>
          )}
        </div>

        {/* ── Medications ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">
            Medications <span aria-hidden="true">*</span>
          </legend>

          {errors.medications && (
            <p id={medicationsErrorId} role="alert" className="text-xs text-red-600">
              {errors.medications}
            </p>
          )}

          <div className="space-y-2" aria-describedby={errors.medications ? medicationsErrorId : undefined}>
            {form.medications.map((med, idx) => (
              <div
                key={med._key}
                className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
              >
                {/* Name */}
                <div className="min-w-[140px] flex-1">
                  <label
                    htmlFor={`med-name-${med._key}`}
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Name
                  </label>
                  <input
                    id={`med-name-${med._key}`}
                    type="text"
                    value={med.name}
                    onChange={(e) => updateMedication(med._key, 'name', e.target.value)}
                    placeholder="Medication name"
                    disabled={isReadOnly}
                    className={[
                      'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                      isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
                    ].join(' ')}
                  />
                </div>

                {/* Dose */}
                <div className="min-w-[100px] flex-1">
                  <label
                    htmlFor={`med-dose-${med._key}`}
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Dose
                  </label>
                  <input
                    id={`med-dose-${med._key}`}
                    type="text"
                    value={med.dose}
                    onChange={(e) => updateMedication(med._key, 'dose', e.target.value)}
                    placeholder="e.g. 10mg"
                    disabled={isReadOnly}
                    className={[
                      'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                      isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
                    ].join(' ')}
                  />
                </div>

                {/* Frequency */}
                <div className="min-w-[120px] flex-1">
                  <label
                    htmlFor={`med-freq-${med._key}`}
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Frequency
                  </label>
                  <input
                    id={`med-freq-${med._key}`}
                    type="text"
                    value={med.frequency}
                    onChange={(e) => updateMedication(med._key, 'frequency', e.target.value)}
                    placeholder="e.g. twice daily"
                    disabled={isReadOnly}
                    className={[
                      'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                      isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
                    ].join(' ')}
                  />
                </div>

                {/* New med flag */}
                <div className="flex items-center gap-1.5 pb-1.5">
                  <input
                    id={`med-new-${med._key}`}
                    type="checkbox"
                    checked={med.newMed}
                    onChange={(e) => updateMedication(med._key, 'newMed', e.target.checked)}
                    disabled={isReadOnly}
                    className="h-4 w-4 accent-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                  />
                  <label
                    htmlFor={`med-new-${med._key}`}
                    className="text-xs font-medium text-gray-600"
                  >
                    New at discharge
                  </label>
                </div>

                {/* Remove button — only shown when >1 row and not read-only */}
                {!isReadOnly && form.medications.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMedication(med._key)}
                    aria-label={`Remove medication row ${idx + 1}`}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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
              </div>
            ))}
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={addMedication}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add medication
            </button>
          )}
        </fieldset>

        {/* ── Risk Level ── */}
        <div>
          <label
            htmlFor="risk-level"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Risk level <span aria-hidden="true">*</span>
          </label>
          <select
            id="risk-level"
            value={form.riskLevel}
            onChange={(e) =>
              setForm((f) => ({ ...f, riskLevel: e.target.value as RiskLevel | '' }))
            }
            disabled={isReadOnly}
            required
            aria-required="true"
            aria-describedby={errors.riskLevel ? riskLevelErrorId : undefined}
            aria-invalid={!!errors.riskLevel}
            className={[
              'w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              errors.riskLevel ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
              isReadOnly ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
            ].join(' ')}
          >
            <option value="">Select risk level…</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          {errors.riskLevel && (
            <p id={riskLevelErrorId} role="alert" className="mt-1 text-xs text-red-600">
              {errors.riskLevel}
            </p>
          )}
        </div>

        {/* ── Actions ── */}
        {!isReadOnly && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting…' : 'Create discharge'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
