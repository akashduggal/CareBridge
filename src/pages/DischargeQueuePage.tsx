import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/contexts/WebSocketContext'
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
import { DischargeDrawer } from '@/components/DischargeDrawer'
import type {
  ApiResponse,
  Call,
  CallOutcome,
  DiagnosisGroup,
  Discharge,
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
        isPhysician ? '' : 'cursor-pointer hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
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
  const { lastDischargeCreatedId } = useWebSocket()
  const isPhysician = role === 'physician'

  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortColumn>('dischargeDateTime')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filters, setFilters] = useState<DischargeFilters>({
    diagnosisGroup: [],
    riskTier: null,
    callOutcome: [],
  })
  const [selectedDischarge, setSelectedDischarge] = useState<Discharge | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [newDischargesBanner, setNewDischargesBanner] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Show banner when a new discharge arrives and we're not on page 1
  useEffect(() => {
    if (lastDischargeCreatedId === null) return
    if (page !== 1) {
      setNewDischargesBanner(true)
    }
  }, [lastDischargeCreatedId, page])

  const queryParams = {
    page,
    limit: 25,
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

  // Fetch calls for the selected discharge when the drawer is open
  const { data: callsData } = useQuery<ApiResponse<Call[]>>({
    queryKey: queryKeys.dischargeCalls(selectedDischarge?.id ?? ''),
    queryFn: () =>
      apiClient<ApiResponse<Call[]>>(`/api/discharges/${selectedDischarge!.id}/calls`),
    enabled: drawerOpen && selectedDischarge !== null,
  })

  const discharges = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const calls = callsData?.data ?? []

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
    setSelectedDischarge(discharge)
    setDrawerOpen(true)
  }

  function handleCloseDrawer() {
    setDrawerOpen(false)
    setSelectedDischarge(null)
  }

  // Close drawer on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) handleCloseDrawer()
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
        {/* Diagnosis Group segmented toggle */}
        <div
          role="group"
          aria-label="Filter by Diagnosis Group"
          className="flex flex-wrap rounded-md border border-gray-300 overflow-hidden"
        >
          {DIAGNOSIS_GROUPS.map((g) => {
            const active = filters.diagnosisGroup.includes(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setFilters((f) => ({
                    ...f,
                    diagnosisGroup: active
                      ? f.diagnosisGroup.filter((x) => x !== g)
                      : [...f.diagnosisGroup, g],
                  }))
                  setPage(1)
                }}
                aria-pressed={active}
                className={[
                  'px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {g}
              </button>
            )
          })}
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

        {/* Call Outcome segmented toggle */}
        <div
          role="group"
          aria-label="Filter by Call Outcome"
          className="flex flex-wrap rounded-md border border-gray-300 overflow-hidden"
        >
          {CALL_OUTCOMES.map((o) => {
            const active = filters.callOutcome.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setFilters((f) => ({
                    ...f,
                    callOutcome: active
                      ? f.callOutcome.filter((x) => x !== o)
                      : [...f.callOutcome, o],
                  }))
                  setPage(1)
                }}
                aria-pressed={active}
                className={[
                  'px-3 py-1.5 text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {o.replace('_', ' ')}
              </button>
            )
          })}
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
        {total > 0 && (
          <Pagination page={page} total={total} onPageChange={setPage} />
        )}
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
      {!isPhysician && (
        <DischargeDrawer
          discharge={selectedDischarge}
          calls={calls}
          isOpen={drawerOpen}
          onClose={handleCloseDrawer}
          triggerRef={triggerRef}
        />
      )}
    </div>
  )
}
