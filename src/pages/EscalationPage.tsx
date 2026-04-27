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
import { EmptyState } from '@/components/EmptyState'
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
  // Records that don't match any section (e.g. Tier 1 with confidence ≥ 0.6) are
  // silently skipped — they should not appear in the escalation view.
  const tier3: Escalation[] = []
  const tier2: Escalation[] = []
  const humanReview: Escalation[] = []

  for (const esc of escalations) {
    try {
      const section = getEscalationSection(esc.riskTier, esc.confidence)
      if (section === 'tier3') tier3.push(esc)
      else if (section === 'tier2') tier2.push(esc)
      else humanReview.push(esc)
    } catch {
      // Record doesn't qualify for any section — skip
    }
  }

  const allEmpty = tier3.length === 0 && tier2.length === 0 && humanReview.length === 0

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
        </div>
      )}

      {!isLoading && !isError && allEmpty && (
        <EmptyState message="No active escalations" />
      )}

      {!isLoading && !isError && !allEmpty && (
        <div className="space-y-8">
          {/* ── Tier 3 Urgent Alerts ── */}
          {tier3.length > 0 && (
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
                {tier3.map((esc) => (
                  <Tier3AlertBanner key={esc.id} escalation={esc} callHref={callHref(esc.callId)} />
                ))}
              </div>
            </section>
          )}

          {/* ── Tier 2 Callback Queue (Nurse/Admin only) ── */}
          {!isPhysician && tier2.length > 0 && (
            <section aria-label="Tier 2 Callback Queue">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
                Tier 2 — Callback Queue
              </h2>
              <div className="space-y-3">
                {tier2.map((esc) => (
                  <Tier2CallbackCard key={esc.id} escalation={esc} />
                ))}
              </div>
            </section>
          )}

          {/* ── Human Review Queue ── */}
          {humanReview.length > 0 && (
            <section aria-label="Human Review Queue">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
                Human Review
              </h2>
              <div className="space-y-3">
                {humanReview.map((esc) => (
                  <HumanReviewCard key={esc.id} escalation={esc} callHref={callHref(esc.callId)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
