import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { formatDate, formatDateTime } from '@/utils/formatUtils'
import { useDemoMode } from '@/hooks/useDemoMode'
import { SkeletonRow } from '@/components/SkeletonCard'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBanner } from '@/components/ErrorBanner'
import { RiskTierBadge } from '@/components/RiskTierBadge'
import { DiagnosisGroupBadge } from '@/components/DiagnosisGroupBadge'
import type { ApiResponse, Discharge, Patient } from '@/types'

function is404(error: unknown): boolean {
  return error instanceof Error && error.message.includes('404')
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const isDemoMode = useDemoMode()

  const {
    data: patientData,
    isLoading: patientLoading,
    isError: patientError,
    error: patientErrorObj,
    refetch: refetchPatient,
  } = useQuery<Patient>({
    queryKey: queryKeys.patient(id ?? ''),
    queryFn: () => apiClient<Patient>(`/api/patients/${id}`),
    enabled: Boolean(id),
  })

  const {
    data: dischargesData,
    isLoading: dischargesLoading,
    isError: dischargesError,
    refetch: refetchDischarges,
  } = useQuery<ApiResponse<Discharge[]>>({
    queryKey: queryKeys.patientDischarges(id ?? ''),
    queryFn: () => apiClient<ApiResponse<Discharge[]>>(`/api/patients/${id}/discharges`),
    enabled: Boolean(id),
  })

  // ── 404 state ──────────────────────────────────────────────────────────────
  if (patientError && is404(patientErrorObj)) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Patient not found</h1>
        <p className="text-sm text-gray-500">
          The patient record you are looking for does not exist or has been removed.
        </p>
        <Link
          to={isDemoMode ? '/patients?demo=true' : '/patients'}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Back to Patient List
        </Link>
      </div>
    )
  }

  const isLoading = patientLoading || dischargesLoading
  const discharges = dischargesData?.data ?? []

  return (
    <div className="space-y-6">
      {/* Back link */}
        <Link
          to={isDemoMode ? '/patients?demo=true' : '/patients'}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          aria-label="Back to patient list"
        >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Patients
      </Link>

      {/* Patient info header */}
      {patientError && !is404(patientErrorObj) ? (
        <ErrorBanner
          message="Failed to load patient information."
          onRetry={() => void refetchPatient()}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {patientLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading patient information">
              <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          ) : patientData ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900">{patientData.name}</h1>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <dt className="font-medium text-gray-500">Date of Birth:</dt>
                  <dd>{formatDate(patientData.dateOfBirth)}</dd>
                </div>
                {patientData.lastDischargeDate && (
                  <div className="flex items-center gap-1">
                    <dt className="font-medium text-gray-500">Last Discharge:</dt>
                    <dd>{formatDate(patientData.lastDischargeDate)}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : null}
        </div>
      )}

      {/* Discharge history */}
      <section aria-labelledby="discharge-history-heading">
        <h2
          id="discharge-history-heading"
          className="mb-3 text-lg font-semibold text-gray-900"
        >
          Discharge History
        </h2>

        {dischargesError && (
          <ErrorBanner
            message="Failed to load discharge history."
            onRetry={() => void refetchDischarges()}
          />
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Discharge Date
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Diagnosis Group
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Risk Tier
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Call Outcome
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}

              {!isLoading && !dischargesError && discharges.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState message="No discharge history found." />
                  </td>
                </tr>
              )}

              {!isLoading &&
                discharges.map((discharge) => (
                  <tr key={discharge.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDateTime(discharge.dischargeDateTime)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <DiagnosisGroupBadge group={discharge.diagnosisGroup} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {discharge.riskTier != null ? (
                        <RiskTierBadge
                          tier={discharge.riskTier}
                          score={discharge.riskScore}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {discharge.callStatus === 'completed' ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          Completed
                        </span>
                      ) : discharge.callStatus === 'pending' ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                          Pending
                        </span>
                      ) : discharge.callStatus === 'in_progress' ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
