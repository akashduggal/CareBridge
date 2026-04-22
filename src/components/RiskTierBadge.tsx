import type { RiskTier } from '@/types'

const TIER_CONFIG: Record<
  RiskTier,
  { label: string; classes: string }
> = {
  1: {
    label: 'Tier 1',
    classes: 'bg-green-100 text-green-700',
  },
  2: {
    label: 'Tier 2',
    classes: 'bg-amber-100 text-amber-700',
  },
  3: {
    label: 'Tier 3',
    classes: 'bg-red-100 text-red-700',
  },
}

interface RiskTierBadgeProps {
  tier: RiskTier
  /** Optionally show the numeric score alongside the tier label */
  score?: number
}

export function RiskTierBadge({ tier, score }: RiskTierBadgeProps) {
  const { label, classes } = TIER_CONFIG[tier]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}
      aria-label={`Risk ${label}${score !== undefined ? `, score ${score}` : ''}`}
    >
      {label}
      {score !== undefined && <span className="opacity-75">({score})</span>}
    </span>
  )
}
