import { describe, it, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
import {
  deriveRiskTier,
  getRiskTierColor,
  shouldShowLowConfidenceWarning,
  getEscalationSection,
} from '@/utils/riskUtils';
import type { RiskTier } from '@/types';

// ─── deriveRiskTier ───────────────────────────────────────────────────────────

describe('deriveRiskTier', () => {
  it('returns tier 1 for score 0', () => {
    expect(deriveRiskTier(0)).toBe(1);
  });

  it('returns tier 1 for score 3 (boundary)', () => {
    expect(deriveRiskTier(3)).toBe(1);
  });

  it('returns tier 2 for score 4 (boundary)', () => {
    expect(deriveRiskTier(4)).toBe(2);
  });

  it('returns tier 2 for score 6 (boundary)', () => {
    expect(deriveRiskTier(6)).toBe(2);
  });

  it('returns tier 3 for score 7 (boundary)', () => {
    expect(deriveRiskTier(7)).toBe(3);
  });

  it('returns tier 3 for score 20', () => {
    expect(deriveRiskTier(20)).toBe(3);
  });
});

/**
 * Property 1: Risk Tier Derivation Consistency
 * Validates: Requirements 3.6, 8.1
 */
test.prop([fc.integer({ min: 0, max: 20 })])(
  'deriveRiskTier returns correct tier for all scores in [0,20]',
  (score) => {
    const tier = deriveRiskTier(score);

    // Must return exactly one of {1, 2, 3}
    expect([1, 2, 3]).toContain(tier);

    // Tier boundaries: ≤3 → 1, 4–6 → 2, ≥7 → 3
    if (score <= 3) {
      expect(tier).toBe(1);
    } else if (score <= 6) {
      expect(tier).toBe(2);
    } else {
      expect(tier).toBe(3);
    }
  }
);

// ─── getRiskTierColor ─────────────────────────────────────────────────────────

describe('getRiskTierColor', () => {
  it('returns green classes for tier 1', () => {
    expect(getRiskTierColor(1)).toBe('text-green-700 bg-green-100');
  });

  it('returns amber classes for tier 2', () => {
    expect(getRiskTierColor(2)).toBe('text-amber-700 bg-amber-100');
  });

  it('returns red classes for tier 3', () => {
    expect(getRiskTierColor(3)).toBe('text-red-700 bg-red-100');
  });

  it('color is consistent with derived tier for all scores in [0,20]', () => {
    for (let score = 0; score <= 20; score++) {
      const tier = deriveRiskTier(score);
      const color = getRiskTierColor(tier);
      if (tier === 1) expect(color).toContain('green');
      if (tier === 2) expect(color).toContain('amber');
      if (tier === 3) expect(color).toContain('red');
    }
  });
});

// ─── shouldShowLowConfidenceWarning ──────────────────────────────────────────

describe('shouldShowLowConfidenceWarning', () => {
  it('returns true for confidence 0.0', () => {
    expect(shouldShowLowConfidenceWarning(0.0)).toBe(true);
  });

  it('returns true for confidence 0.59', () => {
    expect(shouldShowLowConfidenceWarning(0.59)).toBe(true);
  });

  it('returns false for confidence 0.6 (boundary)', () => {
    expect(shouldShowLowConfidenceWarning(0.6)).toBe(false);
  });

  it('returns false for confidence 1.0', () => {
    expect(shouldShowLowConfidenceWarning(1.0)).toBe(false);
  });
});

/**
 * Property 5: Low Confidence Warning Badge Consistency
 * Validates: Requirements 3.8, 3.3
 */
test.prop([fc.float({ min: 0, max: 1, noNaN: true })])(
  'shouldShowLowConfidenceWarning is true iff confidence < 0.6',
  (confidence) => {
    const result = shouldShowLowConfidenceWarning(confidence);
    expect(result).toBe(confidence < 0.6);
  }
);

// ─── getEscalationSection ─────────────────────────────────────────────────────

describe('getEscalationSection', () => {
  it('returns tier3 for riskTier 3 regardless of confidence', () => {
    expect(getEscalationSection(3, 0.0)).toBe('tier3');
    expect(getEscalationSection(3, 0.5)).toBe('tier3');
    expect(getEscalationSection(3, 1.0)).toBe('tier3');
  });

  it('returns tier2 for riskTier 2', () => {
    expect(getEscalationSection(2, 0.0)).toBe('tier2');
    expect(getEscalationSection(2, 0.8)).toBe('tier2');
  });

  it('returns humanReview for riskTier 1 with confidence < 0.6', () => {
    expect(getEscalationSection(1, 0.0)).toBe('humanReview');
    expect(getEscalationSection(1, 0.59)).toBe('humanReview');
  });

  it('throws for riskTier 1 with confidence >= 0.6', () => {
    expect(() => getEscalationSection(1, 0.6)).toThrow();
    expect(() => getEscalationSection(1, 1.0)).toThrow();
  });
});

/**
 * Property 4: Escalation Routing Exclusivity
 * Validates: Requirements 4.4, 4.5, 4.9, 4.1
 *
 * For valid combinations, the function returns exactly one section.
 * For invalid combinations (Tier 1 with confidence >= 0.6), it throws.
 * The test verifies that the function never returns an invalid value.
 *
 * Note: fc.float({ min: 0, max: 1 }) can produce NaN; we use noNaN: true
 * to constrain to the valid confidence domain [0.0, 1.0].
 */
test.prop([
  fc.record({
    riskTier: fc.integer({ min: 1, max: 3 }),
    confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  }),
])(
  'getEscalationSection returns exactly one valid section or throws for invalid input',
  ({ riskTier, confidence }) => {
    const validSections = ['tier3', 'tier2', 'humanReview'] as const;

    try {
      const section = getEscalationSection(riskTier as RiskTier, confidence);
      // If it returns, it must be exactly one valid section
      expect(validSections).toContain(section);
    } catch {
      // Throwing is only valid for Tier 1 with confidence >= 0.6
      expect(riskTier).toBe(1);
      expect(confidence).toBeGreaterThanOrEqual(0.6);
    }
  }
);
