import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { formatDateTime } from '@/utils/formatUtils'
import { RiskTierBadge } from '@/components/RiskTierBadge'
import { DiagnosisGroupBadge } from '@/components/DiagnosisGroupBadge'
import { CallOutcomePill } from '@/components/CallOutcomePill'
import { SkeletonRow } from '@/components/SkeletonCard'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Pagination } from '@/components/Pagination'
import { FocusTrap } from '@/components/FocusTrap'
import type {
  ApiResponse,
  CallOutcome,
  DiagnosisGroup,
  Discharge,
  Medication,
  RiskTier,
} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
type SortColumn = 'patientName' | 'dischargeDateTime' | 'riskTier' | 'callStatus'

interface DischargeFilters {
  diagnosisGroup: DiagnosisGroup[]
  riskTier: RiskTier | null
  callOutcome: CallOutcome[]
}

interface DischargeWithHistory extends Discharge {
  callHistory?: Array<{
    id: string
    timestamp: string
    outcome: CallOutcome
    riskScore?: number
  }>
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function DischargeDrawer({
  discharge,
  onClose,
  triggerRef,
}: {
  discharge: DischargeWithHistory
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Discharge details for ${discharge.patientName}`}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
    >
      <FocusTrap returnFocusRef={triggerRef}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{discharge.patientName}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Medications */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Medications</h3>
            {discharge.medications.length === 0 ? (
              <p className="text-sm text-gray-500">No medications recorded.</p>
            ) : (
              <ul className="space-y-2">
                {discharge.medications.map((med: Medication, i: number) => (
                  <li key={i} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">
                      {med.name}
                      {med.newMed && (
                        <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                          New
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {med.dose} · {med.frequency}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Call history */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Call History</h3>
            {!discharge.callHistory || discharge.callHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No calls recorded.</p>
            ) : (
              <ol className="relative border-l border-gray-200 pl-4 space-y-4">
                {discharge.callHistory.map((call) => (
                  <li key={call.id} className="relative">
                    <span className="absolute -left-[1.125rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                    <p className="text-xs text-gray-500">{formatDateTime(call.timestamp)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <CallOutcomePill outcome={call.outcome} />
                      {call.riskScore !== undefined && (
                        <span className="text-xs text-gray-500">Score: {call.riskScore}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </FocusTrap>
    </div>
  )
}

// ─── Mobile card view ─────────────────────────────────────────────────────────

function DischargeCard({
  discharge,
  onClick,
  isPhysician,
}: {
  discharge: Discharge
  onClick?: () => void
  isPhysician: boolean
}) {
  return (
    <div
      role={isPhysician ? undefined : 'button'}
      tabIndex={isPhysician ? undefined : 0}
      onClick={isPhysician ? undefined : onClick}
      onKeyDown={
        isPhysician
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick?.()
            }
      }
      className={[
        'rounded-lg border border-gray-200 bg-white p-4 shadow-sm',
        isPhysician ? '' : 'cursor-pointer hover:border-blue-300 hover:shadow-md',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">{discharge.patientName}</p>
        {discharge.riskTier && <RiskTierBadge tier={discharge.riskTier} score={discharge.riskScore} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <DiagnosisGroupBadge group={discharge.diagnosisGroup} />
        <CallOutcomePill outcome={discharge.callStatus as CallOutcome} />
      </div>
      <p className="mt-2 text-xs text-gray-500">{formatDateTime(discharge.dischargeDateTime)}</p>
    </div>
  )
}

// ─── DischargeQueuePage ───────────────────────────────────────────────────────

const DIAGNOSIS_GROUPS: DiagnosisGroup[] = ['CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER']
const CALL_OUTCOMES: CallOutcome[] = ['completed', 'voicemail', 'no_answer', 'refused', 'wrong_party']
const RISK_TIERS: RiskTier[] = [1, 2, 3]

export function DischargeQueuePage() {
  const { role } = useAuth()
  const isPhysician = role === 'physician'

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortColumn>('dischargeDateTime')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filters, setFilters] = useState<DischargeFilters>({
    diagnosisGroup: [],
    riskTier: null,
    callOutcome: [],
  })
  const [selectedDischarge, setSelectedDischarge] = useState<DischargeWithHistory | null>(null)
  const [newDischargesBanner, setNewDischargesBanner] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  const queryParams = {
    page,
    sortBy,
    sortDir,
    ...(filters.diagnosisGroup.length > 0 && { diagnosisGroup: filters.diagnosisGroup }),
    ...(filters.riskTier !== null && { riskTier: [filters.riskTier] }),
    ...(filters.callOutcome.length > 0 && { callOutcome: filters.callOutcome }),
  }

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse<Discharge[]>>({
    queryKey: queryKeys.discharges(queryParams),
    queryFn: () => apiClient<ApiResponse<Discharge[]>>('/api/discharges?' + new URLSearchParams(
      Object.entries(queryParams).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((val) => [k, String(val)]) : [[k, String(v)]]
      )
    ).toString()),
  })

  const discharges = data?.data ?? []
  const total = data?.meta?.total ?? 0

  function handleSort(col: SortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleRowClick(discharge: Discharge, el: HTMLElement) {
    if (isPhysician) return
    triggerRef.current = el
    setSelectedDischarge(discharge as DischargeWithHistory)
  }

  function handleCloseDrawer() {
    setSelectedDischarge(null)
  }

  // Close drawer on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && selectedDischarge) handleCloseDrawer()
  }

  function SortIcon({ col }: { col: SortColumn }) {
    if (sortBy !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <h1 className="text-xl font-semibold text-gray-900">Discharge Queue</h1>

      {isError && (
        <ErrorBanner message="Failed to load discharges." onRetry={() => void refetch()} />
      )}

      {/* New discharges banner */}
      {newDischargesBanner && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>New discharges available</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPage(1)
                setNewDischargesBanner(false)
              }}
              className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Go to page 1
            </button>
            <button
              type="button"
              onClick={() => setNewDischargesBanner(false)}
              aria-label="Dismiss"
              className="rounded-md p-1 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3">
        {/* Diagnosis Group multi-select */}
        <div>
          <label htmlFor="filter-diagnosis" className="sr-only">
            Filter by Diagnosis Group
          </label>
          <select
            id="filter-diagnosis"
            multiple
            value={filters.diagnosisGroup}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(
                (o) => o.value as DiagnosisGroup
              )
              setFilters((f) => ({ ...f, diagnosisGroup: selected }))
              setPage(1)
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Filter by Diagnosis Group"
          >
            {DIAGNOSIS_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Risk Tier segmented button */}
        <div
          role="group"
          aria-label="Filter by Risk Tier"
          className="flex rounded-md border border-gray-300 overflow-hidden"
        >
          {([null, ...RISK_TIERS] as (RiskTier | null)[]).map((tier) => (
            <button
              key={tier ?? 'all'}
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...f, riskTier: tier }))
                setPage(1)
              }}
              aria-pressed={filters.riskTier === tier}
              className={[
                'px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                filters.riskTier === tier
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {tier === null ? 'All' : `Tier ${tier}`}
            </button>
          ))}
        </div>

        {/* Call Outcome multi-select */}
        <div>
          <label htmlFor="filter-outcome" className="sr-only">
            Filter by Call Outcome
          </label>
          <select
            id="filter-outcome"
            multiple
            value={filters.callOutcome}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(
                (o) => o.value as CallOutcome
              )
              setFilters((f) => ({ ...f, callOutcome: selected }))
              setPage(1)
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Filter by Call Outcome"
          >
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Mobile card layout (<768px) ── */}
      <div className="space-y-3 tablet:hidden">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
          ))}
        {!isLoading && discharges.length === 0 && (
          <EmptyState message="No discharges found" />
        )}
        {!isLoading &&
          discharges.map((d) => (
            <DischargeCard
              key={d.id}
              discharge={d}
              isPhysician={isPhysician}
              onClick={() => handleRowClick(d, document.activeElement as HTMLElement)}
            />
          ))}
      </div>

      {/* ── Table layout (tablet+) ── */}
      <div className="hidden tablet:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {(
                [
                  { col: 'patientName', label: 'Patient' },
                  { col: null, label: 'Diagnosis' },
                  { col: 'dischargeDateTime', label: 'Discharge Date' },
                  { col: 'callStatus', label: 'Call Outcome' },
                  { col: 'riskTier', label: 'Risk Tier' },
                ] as { col: SortColumn | null; label: string }[]
              ).map(({ col, label }) => (
                <th
                  key={label}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {col ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {label}
                      <SortIcon col={col} />
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
            {!isLoading && discharges.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState message="No discharges found" />
                </td>
              </tr>
            )}
            {!isLoading &&
              discharges.map((d) => (
                <tr
                  key={d.id}
                  onClick={
                    isPhysician
                      ? undefined
                      : (e) => handleRowClick(d, e.currentTarget as HTMLElement)
                  }
                  tabIndex={isPhysician ? undefined : 0}
                  onKeyDown={
                    isPhysician
                      ? undefined
                      : (e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            handleRowClick(d, e.currentTarget as HTMLElement)
                        }
                  }
                  className={[
                    'transition-colors',
                    isPhysician
                      ? 'cursor-default'
                      : 'cursor-pointer hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600',
                  ].join(' ')}
                  aria-label={isPhysician ? undefined : `View details for ${d.patientName}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.patientName}</td>
                  <td className="px-4 py-3">
                    <DiagnosisGroupBadge group={d.diagnosisGroup} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDateTime(d.dischargeDateTime)}
                  </td>
                  <td className="px-4 py-3">
                    <CallOutcomePill outcome={d.callStatus as CallOutcome} />
                  </td>
                  <td className="px-4 py-3">
                    {d.riskTier ? (
                      <RiskTierBadge tier={d.riskTier} score={d.riskScore} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {total > 0 && (
          <Pagination page={page} total={total} onPageChange={setPage} />
        )}
      </div>

      {/* ── Slide-out drawer (Admin/Nurse only) ── */}
      {selectedDischarge && !isPhysician && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={handleCloseDrawer}
            aria-hidden="true"
          />
          <DischargeDrawer
            discharge={selectedDischarge}
            onClose={handleCloseDrawer}
            triggerRef={triggerRef}
          />
        </>
      )}
    </div>
  )
}
