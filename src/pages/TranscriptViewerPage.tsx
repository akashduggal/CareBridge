import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBanner } from '@/components/ErrorBanner'
import { FlaggedPhraseHighlight } from '@/components/FlaggedPhraseHighlight'
import { ScoreMeter } from '@/components/ScoreMeter'
import { RiskTierBadge } from '@/components/RiskTierBadge'
import { deriveRiskTier, shouldShowLowConfidenceWarning } from '@/utils/riskUtils'
import type { CallTranscript, FlaggedPhrase, Utterance } from '@/types'

// ── Utterance bubble ───────────────────────────────────────────────────────────
// Agent: left-aligned, blue bubble  (bg-blue-700 on white → contrast ≥ 4.5:1)
// Patient: right-aligned, teal bubble (bg-teal-700 on white → contrast ≥ 4.5:1)

const SPEAKER_CONFIG = {
  agent: {
    label: 'Agent',
    bubbleClasses: 'bg-blue-700 text-white',
    labelClasses: 'text-blue-700',
    wrapperClasses: 'items-start',
  },
  patient: {
    label: 'Patient',
    bubbleClasses: 'bg-teal-700 text-white',
    labelClasses: 'text-teal-700',
    wrapperClasses: 'items-end',
  },
} as const

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface UtteranceBubbleProps {
  utterance: Utterance
  index: number
  /** Flagged phrases that belong to this utterance (utteranceIndex === index) */
  flaggedPhrases: FlaggedPhrase[]
}

/**
 * Splits `text` into alternating plain/flagged segments.
 * Returns an array of { text, flagged, reason? } objects in order.
 */
function splitByFlaggedPhrases(
  text: string,
  phrases: FlaggedPhrase[],
): Array<{ text: string; flagged: boolean; reason?: string }> {
  if (phrases.length === 0) return [{ text, flagged: false }]

  // Build a list of non-overlapping match ranges, sorted by start position
  type Range = { start: number; end: number; reason: string; phraseText: string }
  const ranges: Range[] = []

  for (const phrase of phrases) {
    const idx = text.indexOf(phrase.text)
    if (idx === -1) continue
    // Skip if this range overlaps an already-recorded range
    const overlaps = ranges.some((r) => idx < r.end && idx + phrase.text.length > r.start)
    if (!overlaps) {
      ranges.push({ start: idx, end: idx + phrase.text.length, reason: phrase.reason, phraseText: phrase.text })
    }
  }

  ranges.sort((a, b) => a.start - b.start)

  const segments: Array<{ text: string; flagged: boolean; reason?: string }> = []
  let cursor = 0

  for (const range of ranges) {
    if (cursor < range.start) {
      segments.push({ text: text.slice(cursor, range.start), flagged: false })
    }
    segments.push({ text: range.phraseText, flagged: true, reason: range.reason })
    cursor = range.end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), flagged: false })
  }

  return segments
}

function UtteranceBubble({ utterance, index, flaggedPhrases }: UtteranceBubbleProps) {
  const config = SPEAKER_CONFIG[utterance.speaker]
  const isAgent = utterance.speaker === 'agent'

  return (
    <li
      className={`flex flex-col gap-1 ${config.wrapperClasses}`}
      aria-label={`${config.label} at ${formatTimestamp(utterance.timestamp)}`}
    >
      {/* Speaker label + timestamp */}
      <div
        className={`flex items-center gap-2 text-xs font-semibold ${config.labelClasses} ${isAgent ? '' : 'flex-row-reverse'}`}
        aria-hidden="true"
      >
        <span>{config.label}</span>
        <span className="font-normal text-gray-400">{formatTimestamp(utterance.timestamp)}</span>
      </div>

      {/* Text bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${config.bubbleClasses}`}
        data-testid={`utterance-bubble-${index}`}
      >
        {flaggedPhrases.length > 0
          ? splitByFlaggedPhrases(utterance.text, flaggedPhrases).map((segment, i) =>
              segment.flagged ? (
                <FlaggedPhraseHighlight key={i} text={segment.text} reason={segment.reason!} />
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )
          : utterance.text}
      </div>
    </li>
  )
}

function is404(error: unknown): boolean {
  return error instanceof Error && error.message.includes('404')
}

/** Converts snake_case category names to Title Case for display. */
function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Groups an array of FlaggedPhrase by their category field. */
function groupFlagsByCategory(phrases: FlaggedPhrase[]): [string, FlaggedPhrase[]][] {
  const map = new Map<string, FlaggedPhrase[]>()
  for (const phrase of phrases) {
    const existing = map.get(phrase.category)
    if (existing) {
      existing.push(phrase)
    } else {
      map.set(phrase.category, [phrase])
    }
  }
  return Array.from(map.entries())
}

export function TranscriptViewerPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError, error, refetch } = useQuery<CallTranscript>({
    queryKey: queryKeys.calls(id ?? ''),
    queryFn: () => apiClient<CallTranscript>(`/api/calls/${id}/transcript`),
    enabled: Boolean(id),
  })

  // ── 404 state ──────────────────────────────────────────────────────────────
  if (isError && is404(error)) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Call not found</h1>
        <p className="text-sm text-gray-500">
          The call transcript you are looking for does not exist or has been removed.
        </p>
        <Link
          to="/discharges"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Back to Discharge Queue
        </Link>
      </div>
    )
  }

  // ── Non-404 error state ────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Call Transcript</h1>
        <ErrorBanner
          message="Failed to load call transcript. Please try again."
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading call transcript">
        <h1 className="text-xl font-semibold text-gray-900">Call Transcript</h1>
        <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
          {/* Transcript area skeleton */}
          <div className="space-y-3 desktop:col-span-2">
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
            <SkeletonCard className="h-16" />
          </div>
          {/* Sidebar skeleton */}
          <div className="space-y-3">
            <SkeletonCard className="h-32" />
            <SkeletonCard className="h-48" />
          </div>
        </div>
      </div>
    )
  }

  // ── Loaded state ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Call Transcript</h1>
      {data && (
        <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
          {/* Transcript area */}
          <div className="desktop:col-span-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-4 text-xs text-gray-500">
                {data.utterances.length} utterance
                {data.utterances.length !== 1 ? 's' : ''}
              </p>
              <ol
                className="flex flex-col gap-4"
                aria-label="Call transcript"
              >
                {data.utterances.map((utterance, index) => (
                  <UtteranceBubble
                    key={index}
                    utterance={utterance}
                    index={index}
                    flaggedPhrases={data.flaggedPhrases.filter((fp) => fp.utteranceIndex === index)}
                  />
                ))}
              </ol>
            </div>
          </div>

          {/* Sidebar — risk flags, score meter, badge rendered in tasks 13.4–13.7 */}
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <ScoreMeter score={data.riskScore} />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Risk Tier</span>
                <RiskTierBadge
                  tier={deriveRiskTier(data.riskScore)}
                  score={data.riskScore}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Confidence</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold text-gray-900"
                    data-testid="confidence-percentage"
                    aria-label={`Confidence: ${Math.round(data.confidence * 100)}%`}
                  >
                    {Math.round(data.confidence * 100)}%
                  </span>
                  {shouldShowLowConfidenceWarning(data.confidence) && (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      data-testid="low-confidence-badge"
                      role="status"
                      aria-label="Low Confidence warning"
                    >
                      Low Confidence
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Risk Flags Sidebar */}
            <section
              aria-label="Risk flags"
              data-testid="risk-flags-sidebar"
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-gray-900">Risk Flags</h2>

              {data.flaggedPhrases.length === 0 ? (
                <p className="mt-3 text-sm italic text-gray-500">No risk flags identified</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {groupFlagsByCategory(data.flaggedPhrases).map(([category, phrases]) => (
                    <div key={category}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">
                          {formatCategoryName(category)}
                        </h3>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          {phrases.length} {phrases.length === 1 ? 'flag' : 'flags'}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {phrases.map((phrase, i) => (
                          <li
                            key={i}
                            data-testid="risk-flag-item"
                            className="rounded-md border border-red-100 bg-red-50 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-gray-600">&ldquo;{phrase.text}&rdquo;</p>
                            <p className="mt-0.5 text-xs text-gray-500">{phrase.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
