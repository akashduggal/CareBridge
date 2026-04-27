import { useEffect, useState } from 'react'
import { deriveRiskTier } from '@/utils/riskUtils'

/**
 * Visual max for the meter scale. Scores above this are clamped to 100% fill.
 * Per spec: scale goes 0–13 (the defined max score), with markers at 3, 6, 10+.
 */
const SCALE_MAX = 13

/** Marker positions: score value → label */
const MARKERS: Array<{ score: number; label: string }> = [
  { score: 3, label: '3' },
  { score: 6, label: '6' },
  { score: 10, label: '10+' },
]

/** Tier-based fill colors for the meter bar. */
const TIER_FILL_COLOR: Record<1 | 2 | 3, string> = {
  1: 'bg-green-500',
  2: 'bg-amber-500',
  3: 'bg-red-500',
}

interface ScoreMeterProps {
  score: number
}

/**
 * Animated horizontal score meter.
 *
 * - Animates from 0% to the target width on mount via CSS transition.
 * - Shows visual markers at scores 3, 6, and 10+ (Tier boundaries).
 * - Color-coded by risk tier: green (≤3), amber (4–6), red (≥7).
 * - Fully accessible: role="meter" with aria-valuenow/min/max/label.
 */
export function ScoreMeter({ score }: ScoreMeterProps) {
  const [animated, setAnimated] = useState(false)

  // Trigger the CSS transition on the next paint after mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setAnimated(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const tier = deriveRiskTier(score)
  const fillColor = TIER_FILL_COLOR[tier]

  // Clamp score to [0, SCALE_MAX] for the visual fill percentage
  const clampedScore = Math.min(Math.max(score, 0), SCALE_MAX)
  const fillPercent = animated ? (clampedScore / SCALE_MAX) * 100 : 0

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Risk Score</p>
        <span className="text-2xl font-bold text-gray-900" aria-hidden="true">
          {score}
        </span>
      </div>

      {/* Meter track */}
      <div
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={SCALE_MAX}
        aria-label={`Risk score meter: ${score} out of ${SCALE_MAX}`}
        className="relative h-4 w-full overflow-hidden rounded-full bg-gray-200"
        data-testid="score-meter"
      >
        {/* Animated fill bar */}
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${fillColor}`}
          style={{ width: `${fillPercent}%` }}
          data-testid="score-meter-fill"
        />

        {/* Marker lines rendered inside the track */}
        {MARKERS.map(({ score: markerScore }) => {
          const markerPercent = (markerScore / SCALE_MAX) * 100
          return (
            <div
              key={markerScore}
              aria-hidden="true"
              className="absolute top-0 h-full w-px bg-white/70"
              style={{ left: `${markerPercent}%` }}
            />
          )
        })}
      </div>

      {/* Marker labels below the track */}
      <div className="relative h-4 w-full" aria-hidden="true">
        {MARKERS.map(({ score: markerScore, label }) => {
          const markerPercent = (markerScore / SCALE_MAX) * 100
          return (
            <span
              key={markerScore}
              className="absolute -translate-x-1/2 text-[10px] text-gray-400"
              style={{ left: `${markerPercent}%` }}
            >
              {label}
            </span>
          )
        })}
      </div>

      {/* Screen-reader accessible description */}
      <p className="sr-only">
        Risk score is {score}. This places the patient in{' '}
        {tier === 1 ? 'Tier 1 (low risk, score 0–3)' : tier === 2 ? 'Tier 2 (medium risk, score 4–6)' : 'Tier 3 (high risk, score 7 or above)'}.
      </p>
    </div>
  )
}
