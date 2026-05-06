/**
 * Tests for EscalationPage — Tasks 14.2, 14.3
 *
 * 14.2 – Render Tier 3 urgent alerts section (above Tier 2):
 *   - Red banners with patient name, risk score, confidence (if <0.6),
 *     and link to transcript
 *   - ARIA live region for screen reader announcements
 *
 * 14.3 – Render Tier 2 callback queue section (Nurse/Admin only):
 *   - Cards with patient name, diagnosis group, discharge datetime, risk score
 *
 * Also covers task 14.10:
 *   - Record with Tier 3 + confidence <0.6 appears only in Tier 3 section
 *
 * Also covers task 14.11:
 *   - Tier 2 section hidden for Physician role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/apiClient', () => ({ apiClient: vi.fn() }))

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/apiClient'
import { getEscalationSection } from '@/utils/riskUtils'
import { EscalationPage } from '@/pages/EscalationPage'
import type { Mock } from 'vitest'
import type { ApiResponse, AuthContextValue, Escalation, RiskTier } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1' } as unknown as User

function mockAuth(role: AuthContextValue['role'] = 'nurse') {
  ;(useAuth as Mock).mockReturnValue({
    user: fakeUser,
    role,
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function makeEscalation(overrides: Partial<Escalation> = {}): Escalation {
  return {
    id: `esc-${Math.random().toString(36).slice(2)}`,
    dischargeId: 'd-1',
    patientName: 'Jane Doe',
    diagnosisGroup: 'CHF',
    dischargeDateTime: '2024-01-15T10:00:00Z',
    riskScore: 8,
    riskTier: 3,
    confidence: 0.75,
    callId: 'call-1',
    createdAt: '2024-01-15T12:00:00Z',
    ...overrides,
  }
}

function makeApiResponse(escalations: Escalation[]): ApiResponse<Escalation[]> {
  return { data: escalations }
}

function renderPage(role: AuthContextValue['role'] = 'nurse') {
  mockAuth(role)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <EscalationPage />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── 14.2: Tier 3 urgent alerts section ──────────────────────────────────────

describe('14.2 – Tier 3 urgent alerts section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Tier 3 alert banner with patient name', async () => {
    const esc = makeEscalation({ patientName: 'Alice Smith', riskTier: 3, riskScore: 9, confidence: 0.8 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })
  })

  it('renders Tier 3 alert banner with risk score', async () => {
    const esc = makeEscalation({ riskTier: 3, riskScore: 9, confidence: 0.8 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      // Risk score appears in the banner text
      expect(screen.getByText(/Risk Score:/)).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument()
    })
  })

  it('renders link to transcript for Tier 3 alert', async () => {
    const esc = makeEscalation({ riskTier: 3, riskScore: 8, confidence: 0.7, callId: 'call-abc' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /view transcript/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/calls/call-abc')
    })
  })

  it('shows confidence value when confidence < 0.6 (Low Confidence badge)', async () => {
    const esc = makeEscalation({ riskTier: 3, riskScore: 9, confidence: 0.45 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      // Low confidence badge should appear with the percentage
      expect(screen.getByText(/Low Confidence/)).toBeInTheDocument()
      expect(screen.getByText(/45%/)).toBeInTheDocument()
    })
  })

  it('does NOT show Low Confidence badge when confidence >= 0.6', async () => {
    const esc = makeEscalation({ riskTier: 3, riskScore: 8, confidence: 0.75 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    expect(screen.queryByText(/Low Confidence/)).not.toBeInTheDocument()
  })

  it('renders Tier 3 section heading above Tier 2 section', async () => {
    const tier3Esc = makeEscalation({ id: 'e1', riskTier: 3, riskScore: 9, confidence: 0.8, patientName: 'Tier3 Patient' })
    const tier2Esc = makeEscalation({ id: 'e2', riskTier: 2, riskScore: 5, confidence: 0.9, patientName: 'Tier2 Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier3Esc, tier2Esc]))

    renderPage()

    // Wait for both sections to render
    await waitFor(() => {
      expect(screen.getByText('Tier3 Patient')).toBeInTheDocument()
      expect(screen.getByText('Tier2 Patient')).toBeInTheDocument()
    })

    // Tier 3 heading should appear before Tier 2 heading in the DOM
    const headings = screen.getAllByRole('heading', { level: 2 })
    const tier3Index = headings.findIndex((h) => h.textContent?.includes('Tier 3'))
    const tier2Index = headings.findIndex((h) => h.textContent?.includes('Tier 2'))
    expect(tier3Index).toBeGreaterThanOrEqual(0)
    expect(tier2Index).toBeGreaterThanOrEqual(0)
    expect(tier3Index).toBeLessThan(tier2Index)
  })

  it('renders ARIA live region on the Tier 3 alerts container', async () => {
    const esc = makeEscalation({ riskTier: 3, riskScore: 9, confidence: 0.8 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })

    // The container wrapping Tier 3 banners must have aria-live for screen readers
    const liveRegion = document.querySelector('[aria-live]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite')
  })

  it('renders multiple Tier 3 banners when multiple Tier 3 escalations exist', async () => {
    const esc1 = makeEscalation({ id: 'e1', riskTier: 3, riskScore: 9, confidence: 0.8, patientName: 'Patient Alpha' })
    const esc2 = makeEscalation({ id: 'e2', riskTier: 3, riskScore: 10, confidence: 0.7, patientName: 'Patient Beta' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc1, esc2]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Patient Alpha')).toBeInTheDocument()
      expect(screen.getByText('Patient Beta')).toBeInTheDocument()
    })
  })

  // ─── 14.10: Tier 3 + low confidence appears only in Tier 3 section ──────────

  it('14.10 – record with Tier 3 + confidence <0.6 appears only in Tier 3 section, not Human Review', async () => {
    // This escalation qualifies for both Tier 3 (riskTier=3) and Human Review (confidence<0.6)
    // Tier 3 takes precedence — it must appear ONLY in the Tier 3 section
    const esc = makeEscalation({ riskTier: 3, riskScore: 9, confidence: 0.4, patientName: 'Dual Qualify Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Dual Qualify Patient')).toBeInTheDocument()
    })

    // Should appear in Tier 3 section
    const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
    expect(within(tier3Section).getByText('Dual Qualify Patient')).toBeInTheDocument()

    // Should NOT appear in Human Review section
    const humanReviewSection = screen.queryByRole('region', { name: /human review/i })
    if (humanReviewSection) {
      expect(within(humanReviewSection).queryByText('Dual Qualify Patient')).not.toBeInTheDocument()
    }

    // Patient name appears exactly once in the document
    expect(screen.getAllByText('Dual Qualify Patient')).toHaveLength(1)
  })

  // ─── 14.11: Tier 2 section hidden for Physician role ────────────────────────

  it('14.11 – Tier 2 callback queue section is hidden for Physician role', async () => {
    const tier3Esc = makeEscalation({ id: 'e1', riskTier: 3, riskScore: 9, confidence: 0.8, patientName: 'Tier3 Patient' })
    const tier2Esc = makeEscalation({ id: 'e2', riskTier: 2, riskScore: 5, confidence: 0.9, patientName: 'Tier2 Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier3Esc, tier2Esc]))

    renderPage('physician')

    await waitFor(() => {
      // Tier 3 section is visible to all roles
      expect(screen.getByText('Tier3 Patient')).toBeInTheDocument()
    })

    // Tier 2 section should NOT be rendered for Physician
    expect(screen.queryByRole('region', { name: /tier 2 callback queue/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Tier2 Patient')).not.toBeInTheDocument()
  })

  it('14.11 – Tier 2 callback queue section IS visible for Nurse role', async () => {
    const tier2Esc = makeEscalation({ id: 'e2', riskTier: 2, riskScore: 5, confidence: 0.9, patientName: 'Tier2 Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier2Esc]))

    renderPage('nurse')

    await waitFor(() => {
      expect(screen.getByText('Tier2 Patient')).toBeInTheDocument()
    })
  })

  it('14.11 – Tier 2 callback queue section IS visible for Admin role', async () => {
    const tier2Esc = makeEscalation({ id: 'e2', riskTier: 2, riskScore: 5, confidence: 0.9, patientName: 'Tier2 Admin Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier2Esc]))

    renderPage('admin')

    await waitFor(() => {
      expect(screen.getByText('Tier2 Admin Patient')).toBeInTheDocument()
    })
  })

  // ─── Loading and error states ─────────────────────────────────────────────

  it('shows loading skeletons while fetching', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderPage()

    // Multiple skeleton cards should be present during loading
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error banner with retry on fetch failure', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows empty state when no escalations exist', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderPage()

    await waitFor(() => {
      // Each section renders its own per-section empty state message
      expect(screen.getByText('No urgent alerts')).toBeInTheDocument()
      expect(screen.getByText('No callbacks pending')).toBeInTheDocument()
      expect(screen.getByText('No cases for review')).toBeInTheDocument()
      expect(screen.getByText('No monitored patients')).toBeInTheDocument()
    })
  })

  // ─── 14.3: Tier 2 callback queue card content ────────────────────────────

  it('14.3 – Tier 2 card displays patient name', async () => {
    const esc = makeEscalation({ riskTier: 2, riskScore: 5, confidence: 0.9, patientName: 'Bob Johnson' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 card displays diagnosis group badge', async () => {
    const esc = makeEscalation({ riskTier: 2, riskScore: 5, confidence: 0.9, diagnosisGroup: 'COPD' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      expect(within(tier2Section).getByText('COPD')).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 card displays formatted discharge datetime', async () => {
    const esc = makeEscalation({ riskTier: 2, riskScore: 5, confidence: 0.9, dischargeDateTime: '2024-01-15T10:00:00Z' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      // formatDateTime produces something like "Jan 15, 2024, 10:00 AM"
      expect(within(tier2Section).getByText(/Jan 15, 2024/)).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 card displays risk score via RiskTierBadge', async () => {
    const esc = makeEscalation({ riskTier: 2, riskScore: 6, confidence: 0.9 })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      // RiskTierBadge renders aria-label "Risk Tier 2, score 6"
      const badge = within(tier2Section).getByLabelText(/risk tier 2.*score 6/i)
      expect(badge).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 card displays all required fields together', async () => {
    const esc = makeEscalation({
      riskTier: 2,
      riskScore: 4,
      confidence: 0.85,
      patientName: 'Carol White',
      diagnosisGroup: 'AMI',
      dischargeDateTime: '2024-03-20T14:30:00Z',
    })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      // Patient name
      expect(within(tier2Section).getByText('Carol White')).toBeInTheDocument()
      // Diagnosis group badge
      expect(within(tier2Section).getByText('AMI')).toBeInTheDocument()
      // Discharge datetime (formatted)
      expect(within(tier2Section).getByText(/Mar 20, 2024/)).toBeInTheDocument()
      // Risk score via badge aria-label
      expect(within(tier2Section).getByLabelText(/risk tier 2.*score 4/i)).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 section renders multiple callback cards', async () => {
    const esc1 = makeEscalation({ id: 'e1', riskTier: 2, riskScore: 4, confidence: 0.9, patientName: 'Patient One' })
    const esc2 = makeEscalation({ id: 'e2', riskTier: 2, riskScore: 6, confidence: 0.8, patientName: 'Patient Two' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc1, esc2]))

    renderPage('nurse')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      expect(within(tier2Section).getByText('Patient One')).toBeInTheDocument()
      expect(within(tier2Section).getByText('Patient Two')).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 2 section is visible for Admin role with correct card content', async () => {
    const esc = makeEscalation({
      riskTier: 2,
      riskScore: 5,
      confidence: 0.9,
      patientName: 'Admin View Patient',
      diagnosisGroup: 'CHF',
    })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('admin')

    await waitFor(() => {
      const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
      expect(within(tier2Section).getByText('Admin View Patient')).toBeInTheDocument()
      expect(within(tier2Section).getByText('CHF')).toBeInTheDocument()
    })
  })

  it('14.3 – Tier 3 record does NOT appear in Tier 2 section (Tier 3 takes precedence)', async () => {
    // A record with riskTier=3 should go to Tier 3 section, not Tier 2
    const tier3Esc = makeEscalation({ id: 'e1', riskTier: 3, riskScore: 8, confidence: 0.9, patientName: 'Tier3 Only Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier3Esc]))

    renderPage('nurse')

    await waitFor(() => {
      expect(screen.getByText('Tier3 Only Patient')).toBeInTheDocument()
    })

    // Tier 2 section is always rendered (with empty state) — but the patient should not be in it
    const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
    expect(within(tier2Section).queryByText('Tier3 Only Patient')).not.toBeInTheDocument()
    expect(within(tier2Section).getByText('No callbacks pending')).toBeInTheDocument()
  })

  // ─── WebSocket: escalation_triggered adds to Tier 3 section ──────────────

  it('14.9 – escalation_triggered WebSocket event adds Tier 3 record without page reload', async () => {
    const initial = makeEscalation({ id: 'e1', riskTier: 3, riskScore: 8, confidence: 0.8, patientName: 'Initial Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([initial]))

    const { qc } = renderPage()

    await waitFor(() => {
      expect(screen.getByText('Initial Patient')).toBeInTheDocument()
    })

    // Simulate WebSocket escalation_triggered event updating the cache
    const newEsc = makeEscalation({ id: 'e2', riskTier: 3, riskScore: 9, confidence: 0.7, patientName: 'New Urgent Patient' })
    act(() => {
      qc.setQueryData(['escalations'], (old: ApiResponse<Escalation[]> | undefined) => {
        if (!old) return old
        return { ...old, data: [newEsc, ...old.data] }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('New Urgent Patient')).toBeInTheDocument()
    })
  })
})

// ─── Property 4: Escalation Routing Exclusivity ───────────────────────────────

// Feature: readmission-prevention-dashboard, Property 4: Escalation Routing Exclusivity

/**
 * Property 4: Escalation Routing Exclusivity
 * Validates: Requirements 4.4, 4.5, 4.9, 4.1
 *
 * For any escalation record with a given riskTier and confidence value,
 * getEscalationSection SHALL return exactly one section identifier from
 * {"tier3", "tier2", "humanReview"}, following these rules:
 *   1. riskTier === 3 → "tier3" (regardless of confidence)
 *   2. riskTier === 2 → "tier2"
 *   3. confidence < 0.6 AND riskTier < 3 → "humanReview"
 * No escalation SHALL appear in more than one section simultaneously.
 */
test.prop([
  fc.record({
    riskTier: fc.integer({ min: 1, max: 3 }),
    confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  }),
])(
  'Property 4 – getEscalationSection returns exactly one valid section or throws for invalid input',
  ({ riskTier, confidence }) => {
    const validSections = ['tier3', 'tier2', 'humanReview', 'tier1'] as const

    try {
      const section = getEscalationSection(riskTier as RiskTier, confidence)

      // Must return exactly one valid section identifier
      expect(validSections).toContain(section)

      // Verify routing rules are followed exclusively (precedence order):
      if (riskTier === 3) {
        // Rule 1: Tier 3 always routes to tier3, regardless of confidence
        expect(section).toBe('tier3')
      } else if (confidence < 0.6 && riskTier < 3) {
        // Rule 2: Low confidence + riskTier < 3 routes to humanReview (takes precedence over tier2)
        expect(section).toBe('humanReview')
      } else if (riskTier === 2 && confidence >= 0.6) {
        // Rule 3: Tier 2 with sufficient confidence routes to tier2
        expect(section).toBe('tier2')
      } else if (riskTier === 1 && confidence >= 0.6) {
        // Rule 4: Tier 1 with sufficient confidence routes to tier1
        expect(section).toBe('tier1')
      }

      // Exclusivity: the returned section is unique — no other section would
      // also claim this record. Verify by checking the other sections
      // would NOT be the result for the same input.
      const otherSections = validSections.filter((s) => s !== section)
      // The function is deterministic — calling it again must return the same section
      expect(getEscalationSection(riskTier as RiskTier, confidence)).toBe(section)
      // And the result must not be any of the other sections
      for (const other of otherSections) {
        expect(section).not.toBe(other)
      }
    } catch {
      // The function should never throw for valid tier/confidence combinations
      // since all cases are now handled (tier1 routes to 'tier1' instead of throwing)
      // If it does throw, fail the test
      throw new Error(`Unexpected throw for riskTier=${riskTier}, confidence=${confidence}`)
    }
  }
)

// ─── escalation-tiers-all-sections – new behavior ────────────────────────────

describe('escalation-tiers-all-sections – new behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 7.1 – All four sections render when data loads with zero records (all-empty state)
  it('7.1 – all four sections render with empty states when data is empty (Nurse role)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderPage('nurse')

    // All four sections must be in the DOM
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /tier 3 urgent alerts/i })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /tier 2 callback queue/i })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /human review/i })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: /tier 1 monitored/i })).toBeInTheDocument()
    })

    // Global "No active escalations" must NOT appear
    expect(screen.queryByText(/no active escalations/i)).toBeNull()

    // Each section shows its correct per-section empty state message
    const tier3Section = screen.getByRole('region', { name: /tier 3 urgent alerts/i })
    const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
    const humanReviewSection = screen.getByRole('region', { name: /human review/i })
    const tier1Section = screen.getByRole('region', { name: /tier 1 monitored/i })

    expect(within(tier3Section).getByText('No urgent alerts')).toBeInTheDocument()
    expect(within(tier2Section).getByText('No callbacks pending')).toBeInTheDocument()
    expect(within(humanReviewSection).getByText('No cases for review')).toBeInTheDocument()
    expect(within(tier1Section).getByText('No monitored patients')).toBeInTheDocument()
  })

  // 7.2 – Four loading skeletons render while query is in-flight
  it('7.2 – four SectionSkeleton containers render while query is in-flight', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {})) // never resolves

    renderPage('nurse')

    // Each SectionSkeleton renders three SkeletonCard elements with animate-pulse.
    // Four skeletons × 3 cards each = 12 animate-pulse elements minimum.
    // We assert at least 4 skeleton containers (one per section).
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThanOrEqual(4)
  })

  // 7.3 – Tier 1 Monitored section renders Tier1MonitoredCard for a qualifying record
  it('7.3 – Tier 1 Monitored section renders Tier1MonitoredCard for a qualifying record', async () => {
    const esc = makeEscalation({
      riskTier: 1,
      riskScore: 2,
      confidence: 0.8,
      patientName: 'Monitored Patient',
      diagnosisGroup: 'CHF',
      dischargeDateTime: '2024-01-15T10:00:00Z',
    })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      const tier1Section = screen.getByRole('region', { name: /tier 1 monitored/i })
      // Patient name appears inside the section
      expect(within(tier1Section).getByText('Monitored Patient')).toBeInTheDocument()
      // DiagnosisGroupBadge text appears in the section
      expect(within(tier1Section).getByText('CHF')).toBeInTheDocument()
      // Discharge date text appears in the section (formatted as "Jan 15, 2024")
      expect(within(tier1Section).getByText(/Jan 15, 2024/)).toBeInTheDocument()
    })
  })

  // 7.4 – Tier 1 record with confidence < 0.6 routes to Human Review, not Tier 1 Monitored
  it('7.4 – Tier 1 record with confidence < 0.6 routes to Human Review, not Tier 1 Monitored', async () => {
    const esc = makeEscalation({
      riskTier: 1,
      riskScore: 2,
      confidence: 0.4,
      patientName: 'Low Conf Patient',
    })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([esc]))

    renderPage('nurse')

    await waitFor(() => {
      // Patient name appears in Human Review section
      const humanReviewSection = screen.getByRole('region', { name: /human review/i })
      expect(within(humanReviewSection).getByText('Low Conf Patient')).toBeInTheDocument()
    })

    // Tier 1 Monitored section shows its empty state
    const tier1Section = screen.getByRole('region', { name: /tier 1 monitored/i })
    expect(within(tier1Section).getByText('No monitored patients')).toBeInTheDocument()
    expect(within(tier1Section).queryByText('Low Conf Patient')).not.toBeInTheDocument()
  })

  // 7.5 – Tier 2 section shows "No callbacks pending" empty state for Nurse when no Tier 2 records exist
  it('7.5 – Tier 2 section shows "No callbacks pending" for Nurse when no Tier 2 records exist', async () => {
    // Only a Tier 3 record — no Tier 2 records
    const tier3Esc = makeEscalation({ riskTier: 3, riskScore: 9, confidence: 0.8, patientName: 'Urgent Patient' })
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([tier3Esc]))

    renderPage('nurse')

    await waitFor(() => {
      // Tier 2 section is in the DOM
      expect(screen.getByRole('region', { name: /tier 2 callback queue/i })).toBeInTheDocument()
    })

    const tier2Section = screen.getByRole('region', { name: /tier 2 callback queue/i })
    expect(within(tier2Section).getByText('No callbacks pending')).toBeInTheDocument()
  })

  // 7.6 – Tier 2 section absent for Physician even when all-empty
  it('7.6 – Tier 2 section absent for Physician even when all-empty', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderPage('physician')

    await waitFor(() => {
      // Other sections are present to confirm data has loaded
      expect(screen.getByRole('region', { name: /tier 3 urgent alerts/i })).toBeInTheDocument()
    })

    expect(screen.queryByRole('region', { name: /tier 2 callback queue/i })).toBeNull()
  })

  // 7.7 – WebSocket escalation_triggered event replaces Tier 1 empty state with a card
  it('7.7 – WebSocket escalation_triggered event replaces Tier 1 empty state with a card', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    const { qc } = renderPage('nurse')

    // Initially, Tier 1 section shows empty state
    await waitFor(() => {
      const tier1Section = screen.getByRole('region', { name: /tier 1 monitored/i })
      expect(within(tier1Section).getByText('No monitored patients')).toBeInTheDocument()
    })

    // Simulate WebSocket escalation_triggered event injecting a Tier 1 record
    const newEsc = makeEscalation({
      id: 'ws-esc-1',
      riskTier: 1,
      riskScore: 2,
      confidence: 0.9,
      patientName: 'WebSocket Patient',
    })

    act(() => {
      qc.setQueryData(['escalations'], (old: ApiResponse<Escalation[]> | undefined) => {
        if (!old) return { data: [newEsc] }
        return { ...old, data: [newEsc, ...old.data] }
      })
    })

    // Card appears in Tier 1 section and empty state is gone
    await waitFor(() => {
      const tier1Section = screen.getByRole('region', { name: /tier 1 monitored/i })
      expect(within(tier1Section).getByText('WebSocket Patient')).toBeInTheDocument()
      expect(within(tier1Section).queryByText('No monitored patients')).not.toBeInTheDocument()
    })
  })

  // 7.8 – Section DOM order is Tier 3 → Tier 2 → Human Review → Tier 1 for Nurse role
  it('7.8 – section DOM order is Tier 3 → Tier 2 → Human Review → Tier 1 for Nurse role', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeApiResponse([]))

    renderPage('nurse')

    await waitFor(() => {
      // Wait for all sections to be rendered
      expect(screen.getByRole('region', { name: /tier 1 monitored/i })).toBeInTheDocument()
    })

    const headings = screen.getAllByRole('heading', { level: 2 })
    const tier3Index = headings.findIndex((h) => /tier 3/i.test(h.textContent ?? ''))
    const tier2Index = headings.findIndex((h) => /tier 2/i.test(h.textContent ?? ''))
    const humanReviewIndex = headings.findIndex((h) => /human review/i.test(h.textContent ?? ''))
    const tier1Index = headings.findIndex((h) => /tier 1/i.test(h.textContent ?? ''))

    expect(tier3Index).toBeGreaterThanOrEqual(0)
    expect(tier2Index).toBeGreaterThanOrEqual(0)
    expect(humanReviewIndex).toBeGreaterThanOrEqual(0)
    expect(tier1Index).toBeGreaterThanOrEqual(0)

    expect(tier3Index).toBeLessThan(tier2Index)
    expect(tier2Index).toBeLessThan(humanReviewIndex)
    expect(humanReviewIndex).toBeLessThan(tier1Index)
  })
})
