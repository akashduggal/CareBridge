import type { RiskTier } from '@/types';

/**
 * Derives the risk tier from a numeric risk score.
 * Score ≤ 3 → Tier 1, Score 4–6 → Tier 2, Score ≥ 7 → Tier 3
 */
export function deriveRiskTier(riskScore: number): RiskTier {
  if (riskScore <= 3) return 1;
  if (riskScore <= 6) return 2;
  return 3;
}

/**
 * Returns Tailwind CSS color classes for a given risk tier.
 * Tier 1 → green, Tier 2 → amber, Tier 3 → red
 */
export function getRiskTierColor(tier: RiskTier): string {
  switch (tier) {
    case 1:
      return 'text-green-700 bg-green-100';
    case 2:
      return 'text-amber-700 bg-amber-100';
    case 3:
      return 'text-red-700 bg-red-100';
  }
}

/**
 * Returns true if the confidence value is below the 0.6 threshold,
 * indicating a low-confidence prediction that warrants a warning badge.
 */
export function shouldShowLowConfidenceWarning(confidence: number): boolean {
  return confidence < 0.6;
}

/**
 * Determines which escalation section an escalation record belongs to.
 * Precedence order: Tier 3 → Human Review → Tier 2 → Tier 1
 * - Tier 3 (riskTier === 3) takes highest precedence regardless of confidence
 * - Human Review (confidence < 0.6 AND riskTier < 3) takes next precedence
 * - Tier 2 (riskTier === 2 AND confidence >= 0.6) maps to the callback queue
 * - Tier 1 (riskTier === 1 AND confidence >= 0.6) maps to monitored patients
 * - Throws if no section matches
 */
export function getEscalationSection(
  riskTier: RiskTier,
  confidence: number
): 'tier3' | 'tier2' | 'humanReview' | 'tier1' {
  if (riskTier === 3) return 'tier3';
  if (confidence < 0.6 && riskTier < 3) return 'humanReview';
  if (riskTier === 2 && confidence >= 0.6) return 'tier2';
  if (riskTier === 1 && confidence >= 0.6) return 'tier1';
  throw new Error('Escalation does not match any section criteria');
}
