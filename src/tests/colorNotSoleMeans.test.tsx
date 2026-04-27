/**
 * Task 18.4 — Verify color is never the sole means of conveying information
 *
 * Validates Requirement 9.4 (WCAG 2.1 AA):
 * "THE Application SHALL ensure color is never the sole means of conveying
 * information (e.g., Risk_Tier badges SHALL include text labels in addition
 * to color)."
 *
 * Each badge/pill/status component must render visible text alongside any
 * color-coded styling so that users who cannot perceive color differences
 * (e.g., color-blind users, screen-reader users) still receive the information.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RiskTierBadge } from '@/components/RiskTierBadge'
import { DiagnosisGroupBadge } from '@/components/DiagnosisGroupBadge'
import { CallOutcomePill } from '@/components/CallOutcomePill'
import type { CallOutcome, DiagnosisGroup, RiskTier } from '@/types'

// ─── RiskTierBadge ────────────────────────────────────────────────────────────

describe('18.4 – RiskTierBadge: text label alongside color', () => {
  const tiers: RiskTier[] = [1, 2, 3]
  const expectedLabels: Record<RiskTier, string> = {
    1: 'Tier 1',
    2: 'Tier 2',
    3: 'Tier 3',
  }

  tiers.forEach((tier) => {
    it(`renders visible text label "${expectedLabels[tier]}" for tier ${tier}`, () => {
      render(<RiskTierBadge tier={tier} />)
      // The badge must contain the tier label as visible text (not just aria-label)
      expect(screen.getByText(expectedLabels[tier])).toBeInTheDocument()
    })

    it(`renders aria-label containing "Risk ${expectedLabels[tier]}" for tier ${tier}`, () => {
      render(<RiskTierBadge tier={tier} />)
      // aria-label provides the accessible name for screen readers
      const badge = screen.getByText(expectedLabels[tier]).closest('span')!
      expect(badge).toHaveAttribute('aria-label', expect.stringContaining(`Risk ${expectedLabels[tier]}`))
    })

    it(`includes score in aria-label when score prop is provided for tier ${tier}`, () => {
      const score = tier === 1 ? 2 : tier === 2 ? 5 : 8
      render(<RiskTierBadge tier={tier} score={score} />)
      const badge = screen.getByText(expectedLabels[tier]).closest('span')!
      expect(badge).toHaveAttribute('aria-label', expect.stringContaining(`score ${score}`))
    })
  })
})

// ─── DiagnosisGroupBadge ──────────────────────────────────────────────────────

describe('18.4 – DiagnosisGroupBadge: text label alongside color', () => {
  const groups: DiagnosisGroup[] = ['CHF', 'COPD', 'AMI', 'PNEUMONIA', 'ORTHO', 'OTHER']

  groups.forEach((group) => {
    it(`renders visible text label "${group}" for diagnosis group`, () => {
      render(<DiagnosisGroupBadge group={group} />)
      // The badge must show the group name as visible text
      expect(screen.getByText(group)).toBeInTheDocument()
    })
  })
})

// ─── CallOutcomePill ──────────────────────────────────────────────────────────

describe('18.4 – CallOutcomePill: text label alongside color', () => {
  const outcomes: Array<{ outcome: CallOutcome; expectedLabel: string }> = [
    { outcome: 'completed', expectedLabel: 'Completed' },
    { outcome: 'voicemail', expectedLabel: 'Voicemail' },
    { outcome: 'no_answer', expectedLabel: 'No Answer' },
    { outcome: 'refused', expectedLabel: 'Refused' },
    { outcome: 'wrong_party', expectedLabel: 'Wrong Party' },
  ]

  outcomes.forEach(({ outcome, expectedLabel }) => {
    it(`renders visible text label "${expectedLabel}" for outcome "${outcome}"`, () => {
      render(<CallOutcomePill outcome={outcome} />)
      // The pill must show the outcome as visible text, not just color
      expect(screen.getByText(expectedLabel)).toBeInTheDocument()
    })
  })
})

// ─── Cross-component: no icon-only color indicators ──────────────────────────

describe('18.4 – All badge/pill components: text is not empty', () => {
  it('RiskTierBadge span has non-empty text content', () => {
    const { container } = render(<RiskTierBadge tier={2} />)
    const badge = container.querySelector('span[aria-label]')!
    // The visible text content (excluding sr-only) must be non-empty
    expect(badge.textContent?.trim()).not.toBe('')
  })

  it('DiagnosisGroupBadge span has non-empty text content', () => {
    const { container } = render(<DiagnosisGroupBadge group="CHF" />)
    const badge = container.querySelector('span')!
    expect(badge.textContent?.trim()).not.toBe('')
  })

  it('CallOutcomePill span has non-empty text content', () => {
    const { container } = render(<CallOutcomePill outcome="completed" />)
    const pill = container.querySelector('span')!
    expect(pill.textContent?.trim()).not.toBe('')
  })
})
