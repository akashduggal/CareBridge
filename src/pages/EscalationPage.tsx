import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { useDemoMode } from '@/hooks/useDemoMode'
import { getEscalationSection, shouldShowLowConfidenceWarning } from '@/utils/riskUtils'
import { formatDateTime } from '@/utils/formatUtils'
import { DiagnosisGroupBadge } from '@/components/DiagnosisGroupBadge'
import { RiskTierBadge } from '@/components/RiskTierBadge'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { ApiResponse, Escalation } from '@/types'

// ─── Section skeleton ─────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonCard className="h-6 w-40" />
      <SkeletonCard className="h-20" />
      <SkeletonCard className="h-20" />
    </div>
  )
}

// ─── Tier 3 urgent alert banner ───────────────────────────────────────────────

function Tier3AlertBanner({ escalation, callHref }: { escalation: Escalation; callHref: string }) {
  const showLowConf = shouldShowLowConfidenceWarning(escalation.confidence)
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-red-900">{escalation.patientName}</span>
          <RiskTierBadge tier={escalation.riskTier} score={escalation.riskScore} />
          {showLowConf && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              Low Confidence ({Math.round(escalation.confidence * 100)}%)
            </span>
          )}
        </div>
        <p className="text-sm text-red-700">
          Risk Score: <strong>{escalation.riskScore}</strong>
          {!showLowConf && (
            <span className="ml-2 text-red-600">
              Confidence: {Math.round(escalation.confidence * 100)}%
            </span>
          )}
        </p>
      </div>
      <Link
        to={callHref}
        className="flex-shrink-0 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
      >
        View Transcript
      </Link>
    </div>
  )
}

// ─── Tier 2 callback card ─────────────────────────────────────────────────────

function Tier2CallbackCard({ escalation }: { escalation: Escalation }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-amber-900">{escalation.patientName}</span>
            <DiagnosisGroupBadge group={escalation.diagnosisGroup} />
            <RiskTierBadge tier={escalation.riskTier} score={escalation.riskScore} />
          </div>
          <p className="text-sm text-amber-700">
            Discharged: {formatDateTime(escalation.dischargeDateTime)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Human review card ────────────────────────────────────────────────────────

function HumanReviewCard({ escalation, callHref }: { escalation: Escalation; callHref: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-900">{escalation.patientName}</span>
          <RiskTierBadge tier={escalation.riskTier} score={escalation.riskScore} />
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            Low Confidence ({Math.round(escalation.confidence * 100)}%)
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Risk Score: <strong>{escalation.riskScore}</strong>
        </p>
      </div>
      <Link
        to={callHref}
        className="flex-shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
      >
        View Transcript
      </Link>
    </div>
  )
}

// ─── Section empty state ──────────────────────────────────────────────────────

interface SectionEmptyStateProps {
  message: string
}

function SectionEmptyState({ message }: SectionEmptyStateProps) {
  return (
    <p className="text-sm text-gray-400 py-4 text-center">{message}</p>
  )
}

// ─── Tier 1 monitored card ────────────────────────────────────────────────────

function Tier1MonitoredCard({ escalation }: { escalation: Escalation }) {
  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-green-900 font-semibold">{escalation.patientName}</span>
        <RiskTierBadge tier={escalation.riskTier} />
        <DiagnosisGroupBadge group={escalation.diagnosisGroup} />
      </div>
      <p className="mt-1 text-sm text-green-700">
        Discharged: {formatDateTime(escalation.dischargeDateTime)}
      </p>
    </div>
  )
}

// ─── EscalationPage ───────────────────────────────────────────────────────────

export function EscalationPage() {
  const { role } = useAuth()
  const isDemoMode = useDemoMode()
  const isPhysician = role === 'physician'

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse<Escalation[]>>({
    queryKey: queryKeys.escalations(),
    queryFn: () => apiClient<ApiResponse<Escalation[]>>('/api/escalations'),
  })

  const escalations = data?.data ?? []

  function callHref(callId: string) {
    return isDemoMode ? `/calls/${callId}?demo=true` : `/calls/${callId}`
  }

  // Partition escalations into sections using getEscalationSection routing logic.
  // Records that throw (no matching section) are silently skipped.
  const tier3: Escalation[] = []
  const tier2: Escalation[] = []
  const humanReview: Escalation[] = []
  const tier1: Escalation[] = []

  for (const esc of escalations) {
    try {
      const section = getEscalationSection(esc.riskTier, esc.confidence)
      if (section === 'tier3') tier3.push(esc)
      else if (section === 'tier2') tier2.push(esc)
      else if (section === 'humanReview') humanReview.push(esc)
      else if (section === 'tier1') tier1.push(esc)
    } catch {
      // Record doesn't qualify for any section — skip
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Escalations</h1>

      {isError && (
        <ErrorBanner
          message="Failed to load escalations."
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && (
        <div className="space-y-8">
          <SectionSkeleton />
          <SectionSkeleton />
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-8">
          {/* ── Tier 3 Urgent Alerts ── */}
          <section aria-label="Tier 3 Urgent Alerts">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
              Tier 3 — Urgent Alerts
            </h2>
            {/* aria-live region so screen readers announce new urgent alerts */}
            <div
              aria-live="polite"
              aria-atomic="false"
              aria-relevant="additions"
              className="space-y-3"
            >
              {tier3.length > 0 ? (
                tier3.map((esc) => (
                  <Tier3AlertBanner key={esc.id} escalation={esc} callHref={callHref(esc.callId)} />
                ))
              ) : (
                <SectionEmptyState message="No urgent alerts" />
              )}
            </div>
          </section>

          {/* ── Tier 2 Callback Queue (Nurse/Admin only) ── */}
          {!isPhysician && (
            <section aria-label="Tier 2 Callback Queue">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
                Tier 2 — Callback Queue
              </h2>
              <div className="space-y-3">
                {tier2.length > 0 ? (
                  tier2.map((esc) => (
                    <Tier2CallbackCard key={esc.id} escalation={esc} />
                  ))
                ) : (
                  <SectionEmptyState message="No callbacks pending" />
                )}
              </div>
            </section>
          )}

          {/* ── Human Review ── */}
          <section aria-label="Human Review">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
              Human Review
            </h2>
            <div className="space-y-3">
              {humanReview.length > 0 ? (
                humanReview.map((esc) => (
                  <HumanReviewCard key={esc.id} escalation={esc} callHref={callHref(esc.callId)} />
                ))
              ) : (
                <SectionEmptyState message="No cases for review" />
              )}
            </div>
          </section>

          {/* ── Tier 1 Monitored ── */}
          <section aria-label="Tier 1 Monitored">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-green-700">
              Tier 1 — Monitored
            </h2>
            <div className="space-y-3">
              {tier1.length > 0 ? (
                tier1.map((esc) => (
                  <Tier1MonitoredCard key={esc.id} escalation={esc} />
                ))
              ) : (
                <SectionEmptyState message="No monitored patients" />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
