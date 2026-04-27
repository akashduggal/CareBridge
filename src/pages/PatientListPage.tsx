import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { formatDate } from '@/utils/formatUtils'
import { useDebounce } from '@/hooks/useDebounce'
import { SkeletonRow } from '@/components/SkeletonCard'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Pagination } from '@/components/Pagination'
import type { ApiResponse, Patient } from '@/types'

const LIMIT = 25
const DEBOUNCE_MS = 300

export function PatientListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, DEBOUNCE_MS)

  // Reset to page 1 whenever the debounced search query changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const queryParams = debouncedSearch
    ? { page, limit: LIMIT, search: debouncedSearch }
    : { page, limit: LIMIT }

  const apiUrl = debouncedSearch
    ? `/api/patients?search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${LIMIT}`
    : `/api/patients?page=${page}&limit=${LIMIT}`

  const { data, isLoading, isFetching, isError, refetch } = useQuery<ApiResponse<Patient[]>>({
    queryKey: queryKeys.patients(queryParams),
    queryFn: () => apiClient<ApiResponse<Patient[]>>(apiUrl),
  })

  const showSkeleton = isLoading || isFetching

  const patients = data?.data ?? []
  const total = data?.meta?.total ?? 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Patients</h1>

      {/* Search input */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="patient-search"
          className="text-sm font-medium text-gray-700"
        >
          Search patients
        </label>
        <input
          id="patient-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Name or date of birth…"
          className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          aria-label="Search patients"
        />
      </div>

      {isError && (
        <ErrorBanner message="Failed to load patients." onRetry={() => void refetch()} />
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Date of Birth
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Last Discharge Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {showSkeleton &&
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={3} />)}

            {!showSkeleton && patients.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState message="No patients found." />
                </td>
              </tr>
            )}

            {!showSkeleton &&
              patients.map((patient) => (
                <tr
                  key={patient.id}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate(`/patients/${patient.id}`)
                    }
                  }}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                  aria-label={`View details for ${patient.name}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {patient.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(patient.dateOfBirth)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {patient.lastDischargeDate
                      ? formatDate(patient.lastDischargeDate)
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {total > 0 && (
          <Pagination page={page} total={total} onPageChange={setPage} />
        )}
      </div>
    </div>
  )
}
