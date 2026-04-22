import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { DashboardStats } from '@/types'

// ─── Tier colors (≥4.5:1 contrast on white) ──────────────────────────────────
const TIER_COLORS = {
  tier1: '#15803d', // green-700
  tier2: '#b45309', // amber-700
  tier3: '#b91c1c', // red-700
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
}: {
  label: string
  value: number | undefined
  loading: boolean
}) {
  if (loading) return <SkeletonCard className="h-24" />
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value ?? '—'}</p>
    </div>
  )
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery<DashboardStats>({
    queryKey: queryKeys.dashboard(),
    queryFn: () => apiClient<DashboardStats>('/api/dashboard/stats'),
  })

  // Derived display values — WebSocketContext updates the dashboard cache directly
  // on discharge_created events, so these values stay current without a full reload.
  const todayDischarges = data?.todayDischarges ?? 0
  const pendingCalls = data?.pendingCalls ?? 0
  const activeEscalations = data?.activeEscalations ?? 0

  // Donut chart data — uses completedToday, NOT todayDischarges
  const tierDistribution = data
    ? [
        { name: 'Tier 1', value: data.tierDistribution.tier1, color: TIER_COLORS.tier1 },
        { name: 'Tier 2', value: data.tierDistribution.tier2, color: TIER_COLORS.tier2 },
        { name: 'Tier 3', value: data.tierDistribution.tier3, color: TIER_COLORS.tier3 },
      ]
    : []

  const dailyVolume = data?.dailyVolume ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {isError && (
        <ErrorBanner
          message="Failed to load dashboard statistics."
          onRetry={() => void refetch()}
        />
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
        <StatCard label="Today's Discharges" value={todayDischarges} loading={isLoading} />
        <StatCard label="Pending Calls" value={pendingCalls} loading={isLoading} />
        <StatCard label="Active Escalations" value={activeEscalations} loading={isLoading} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
        {/* Donut chart — Risk Tier distribution */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Risk Tier Distribution</h2>
          {isLoading ? (
            <SkeletonCard className="h-48" />
          ) : (() => {
            const allZero = tierDistribution.every((d) => d.value === 0)
            if (allZero) {
              return (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  No completed calls today
                </div>
              )
            }
            const ariaDesc = tierDistribution
              .map((d) => `${d.name}: ${d.value}`)
              .join(', ')
            return (
              <>
                <div
                  role="img"
                  aria-label={`Risk tier distribution donut chart. ${ariaDesc}`}
                >
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={tierDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        dataKey="value"
                        aria-label="Risk tier distribution donut chart"
                      >
                        {tierDistribution.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={entry.color}
                            aria-label={`${entry.name}: ${entry.value}`}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Screen-reader text alternative */}
                <table className="sr-only" aria-label="Risk tier distribution data">
                  <thead>
                    <tr>
                      <th scope="col">Tier</th>
                      <th scope="col">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierDistribution.map((d) => (
                      <tr key={d.name}>
                        <td>{d.name}</td>
                        <td>{d.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Legend */}
                <div className="mt-3 flex justify-center gap-4 text-xs">
                  {tierDistribution.map((d) => (
                    <span key={d.name} className="flex items-center gap-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                        aria-hidden="true"
                      />
                      {d.name}: {d.value}
                    </span>
                  ))}
                </div>
              </>
            )
          })()}
        </div>

        {/* Bar chart — Daily discharge volume */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Daily Discharge Volume (Past 7 Days)
          </h2>
          {isLoading ? (
            <SkeletonCard className="h-48" />
          ) : (
            <>
              <div
                role="img"
                aria-label={`Daily discharge volume bar chart for the past 7 days. ${dailyVolume.map((d) => `${d.date}: ${d.count}`).join(', ')}`}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyVolume}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" name="Discharges" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Screen-reader text alternative */}
              <table className="sr-only" aria-label="Daily discharge volume data">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Discharges</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyVolume.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
