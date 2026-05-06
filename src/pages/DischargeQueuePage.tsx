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
import { CallStatusPill } from '@/components/CallStatusPill'
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

// ─── Multi-select dropdown ────────────────────────────────────────────────────

interface MultiSelectDropdownProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  selected: T[]
  onChange: (next: T[]) => void
}

function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(value: T) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${label} (${selected.length})`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          selected.length > 0
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        <span>{summary}</span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt) => {
            const checked = selected.includes(opt.value)
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(opt.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(opt.value) }}
                tabIndex={0}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:outline-none focus-visible:bg-blue-50"
              >
                <span
                  className={[
                    'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                    checked ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </li>
            )
          })}
          {selected.length > 0 && (
            <>
              <li className="mx-2 my-1 border-t border-gray-100" role="separator" />
              <li
                role="option"
                aria-selected={false}
                onClick={() => onChange([])}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onChange([]) }}
                tabIndex={0}
                className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
              >
                Clear all
              </li>
            </>
          )}
        </ul>
      )}
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
        isPhysician ? '' : 'cursor-pointer hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">{discharge.patientName}</p>
        {discharge.riskTier && <RiskTierBadge tier={discharge.riskTier} score={discharge.riskScore} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <DiagnosisGroupBadge group={discharge.diagnosisGroup} />
        <CallStatusPill status={discharge.callStatus} />
        <CallOutcomePill outcome={(discharge.callOutcome ?? discharge.callStatus) as CallOutcome} />
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
      <div className="flex flex-wrap items-center gap-3">
        {/* Risk Tier segmented button — unchanged */}
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

        {/* Diagnosis Group multi-select dropdown */}
        <MultiSelectDropdown
          label="Diagnosis"
          options={DIAGNOSIS_GROUPS.map((g) => ({ value: g, label: g }))}
          selected={filters.diagnosisGroup}
          onChange={(next) => {
            setFilters((f) => ({ ...f, diagnosisGroup: next }))
            setPage(1)
          }}
        />

        {/* Call Outcome multi-select dropdown */}
        <MultiSelectDropdown
          label="Outcome"
          options={CALL_OUTCOMES.map((o) => ({
            value: o,
            label: o.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          }))}
          selected={filters.callOutcome}
          onChange={(next) => {
            setFilters((f) => ({ ...f, callOutcome: next }))
            setPage(1)
          }}
        />
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
                  { col: 'callStatus', label: 'Call Status' },
                  { col: null, label: 'Call Outcome' },
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
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
            {!isLoading && discharges.length === 0 && (
              <tr>
                <td colSpan={6}>
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
                    <CallStatusPill status={d.callStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {d.callOutcome ? (
                      <CallOutcomePill outcome={d.callOutcome} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
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
