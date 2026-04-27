/**
 * Tests for TranscriptViewerPage — Task 13.8
 *
 * 13.8 – Show loading skeleton for transcript area and sidebar while fetching
 *
 * Verifies that while GET /calls/:id/transcript is in-flight, the page renders
 * skeleton placeholders for both the transcript area and the sidebar, and that
 * those skeletons are replaced by real content once the fetch resolves.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── Mock apiClient ───────────────────────────────────────────────────────────

vi.mock('@/lib/apiClient', () => ({
  apiClient: vi.fn(),
}))

import { apiClient } from '@/lib/apiClient'
import { TranscriptViewerPage } from '@/pages/TranscriptViewerPage'
import type { Mock } from 'vitest'
import type { CallTranscript } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTranscript(overrides: Partial<CallTranscript> = {}): CallTranscript {
  return {
    id: 'transcript-1',
    callId: 'call-1',
    riskScore: 5,
    confidence: 0.8,
    riskTier: 2,
    utterances: [
      { speaker: 'agent', text: 'Hello, how are you feeling today?', timestamp: 0 },
      { speaker: 'patient', text: 'I have been feeling short of breath.', timestamp: 5 },
    ],
    flaggedPhrases: [
      {
        text: 'short of breath',
        category: 'symptom_worsening',
        reason: 'Indicates potential respiratory deterioration',
        utteranceIndex: 1,
      },
    ],
    ...overrides,
  }
}

/**
 * Renders TranscriptViewerPage inside a MemoryRouter with the given call ID.
 * Uses a fresh QueryClient with retries disabled to avoid test flakiness.
 */
function renderTranscriptViewer(callId = 'call-1', qc?: QueryClient) {
  const testQc =
    qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc: testQc,
    ...render(
      <QueryClientProvider client={testQc}>
        <MemoryRouter initialEntries={[`/calls/${callId}`]}>
          <Routes>
            <Route path="/calls/:id" element={<TranscriptViewerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── Task 13.8: Loading skeleton tests ───────────────────────────────────────

describe('13.8 – Loading skeleton for transcript area and sidebar while fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton placeholders while the transcript fetch is in-flight', () => {
    // Never-resolving promise keeps the component in the loading state
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderTranscriptViewer()

    // The outer container should be marked as busy for screen readers
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()

    // Multiple skeleton cards should be present (transcript area + sidebar)
    const skeletons = screen.getAllByRole('status', { name: /loading/i })
    expect(skeletons.length).toBeGreaterThanOrEqual(2)
  })

  it('renders at least 5 skeleton cards for the transcript area while loading', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderTranscriptViewer()

    // 5 utterance-height skeletons for transcript + 2 for sidebar = 7 total
    const skeletons = screen.getAllByRole('status', { name: /loading/i })
    expect(skeletons.length).toBeGreaterThanOrEqual(7)
  })

  it('replaces skeletons with real transcript content once data loads', async () => {
    const transcript = makeTranscript()
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    // Wait for the transcript content to appear
    await waitFor(() => {
      expect(screen.getByText('Hello, how are you feeling today?')).toBeInTheDocument()
    })

    // Skeletons should no longer be present
    expect(screen.queryAllByRole('status', { name: /loading/i })).toHaveLength(0)
  })

  it('replaces skeletons with sidebar content (risk flags) once data loads', async () => {
    const transcript = makeTranscript()
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    // Sidebar skeleton should be gone
    expect(screen.queryAllByRole('status', { name: /loading/i })).toHaveLength(0)
  })

  it('shows the page heading during loading (not hidden behind skeleton)', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderTranscriptViewer()

    expect(screen.getByRole('heading', { name: /call transcript/i })).toBeInTheDocument()
  })
})

// ─── Task 13.9: 404 "Call not found" state ───────────────────────────────────

describe('13.9 – Show "Call not found" with link to Discharge Queue on 404', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Call not found" heading when the API returns a 404 error', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 404'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /call not found/i })).toBeInTheDocument()
    })
  })

  it('renders a link back to /discharges on 404', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 404'))

    renderTranscriptViewer()

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /back to discharge queue/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/discharges')
    })
  })

  it('does not show the generic error banner on a 404', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 404'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /call not found/i })).toBeInTheDocument()
    })

    // The generic error message should not appear
    expect(screen.queryByText(/failed to load call transcript/i)).not.toBeInTheDocument()
  })

  it('does not show "Call not found" for non-404 errors', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByText(/failed to load call transcript/i)).toBeInTheDocument()
    })

    expect(screen.queryByRole('heading', { name: /call not found/i })).not.toBeInTheDocument()
  })
})

// ─── Task 13.11: Flagged phrase count invariant ───────────────────────────────
//
// Feature: readmission-prevention-dashboard
// Property 6: Flagged Phrase Count Invariant
//
// FOR ALL loaded transcripts, the count of highlighted FlaggedPhrase elements
// in the transcript body SHALL equal the count of items listed in the risk
// flags sidebar. No flagged phrase SHALL be highlighted without appearing in
// the sidebar, and no sidebar item SHALL exist without a corresponding
// highlight in the transcript.

describe('13.11 – Flagged phrase count equals sidebar item count (Property 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('count of highlighted phrases in transcript equals count of sidebar items — single phrase', async () => {
    const transcript = makeTranscript()
    // makeTranscript() has 1 flagged phrase
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    const highlights = screen.getAllByTestId('flagged-phrase-highlight')
    const sidebarItems = screen.getAllByTestId('risk-flag-item')

    expect(highlights).toHaveLength(transcript.flaggedPhrases.length)
    expect(sidebarItems).toHaveLength(transcript.flaggedPhrases.length)
    expect(highlights.length).toBe(sidebarItems.length)
  })

  it('count of highlighted phrases equals sidebar items — multiple phrases across utterances', async () => {
    const transcript = makeTranscript({
      utterances: [
        { speaker: 'agent', text: 'Are you taking your medications?', timestamp: 0 },
        { speaker: 'patient', text: 'I stopped taking my pills last week.', timestamp: 5 },
        { speaker: 'agent', text: 'Any chest pain or shortness of breath?', timestamp: 10 },
        { speaker: 'patient', text: 'Yes, I have chest pain and feel dizzy.', timestamp: 15 },
      ],
      flaggedPhrases: [
        {
          text: 'stopped taking my pills',
          category: 'medication_adherence',
          reason: 'Patient reports medication non-adherence',
          utteranceIndex: 1,
        },
        {
          text: 'chest pain',
          category: 'symptom_worsening',
          reason: 'Chest pain is a high-risk cardiac symptom',
          utteranceIndex: 3,
        },
        {
          text: 'feel dizzy',
          category: 'symptom_worsening',
          reason: 'Dizziness may indicate hemodynamic instability',
          utteranceIndex: 3,
        },
      ],
    })
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    const highlights = screen.getAllByTestId('flagged-phrase-highlight')
    const sidebarItems = screen.getAllByTestId('risk-flag-item')

    expect(highlights).toHaveLength(3)
    expect(sidebarItems).toHaveLength(3)
    expect(highlights.length).toBe(sidebarItems.length)
  })

  it('shows zero highlights and zero sidebar items when there are no flagged phrases', async () => {
    const transcript = makeTranscript({ flaggedPhrases: [] })
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    expect(screen.queryAllByTestId('flagged-phrase-highlight')).toHaveLength(0)
    expect(screen.queryAllByTestId('risk-flag-item')).toHaveLength(0)
    expect(screen.getByText(/no risk flags identified/i)).toBeInTheDocument()
  })

  it('shows "No risk flags identified" message only when flaggedPhrases is empty', async () => {
    // With phrases — message should NOT appear
    const transcriptWithPhrases = makeTranscript()
    ;(apiClient as Mock).mockResolvedValue(transcriptWithPhrases)

    const { unmount } = renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    expect(screen.queryByText(/no risk flags identified/i)).not.toBeInTheDocument()

    unmount()

    // Without phrases — message SHOULD appear
    const transcriptWithoutPhrases = makeTranscript({ flaggedPhrases: [] })
    ;(apiClient as Mock).mockResolvedValue(transcriptWithoutPhrases)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByText(/no risk flags identified/i)).toBeInTheDocument()
    })
  })

  it('each highlighted phrase text matches a corresponding sidebar item text', async () => {
    const transcript = makeTranscript({
      utterances: [
        { speaker: 'agent', text: 'How is your breathing?', timestamp: 0 },
        { speaker: 'patient', text: 'I have been short of breath and very fatigued.', timestamp: 5 },
      ],
      flaggedPhrases: [
        {
          text: 'short of breath',
          category: 'symptom_worsening',
          reason: 'Respiratory symptom indicating possible deterioration',
          utteranceIndex: 1,
        },
        {
          text: 'very fatigued',
          category: 'symptom_worsening',
          reason: 'Fatigue may indicate worsening heart failure',
          utteranceIndex: 1,
        },
      ],
    })
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    const highlights = screen.getAllByTestId('flagged-phrase-highlight')
    const sidebarItems = screen.getAllByTestId('risk-flag-item')

    expect(highlights).toHaveLength(2)
    expect(sidebarItems).toHaveLength(2)

    // Each phrase text appears in both the transcript highlight and the sidebar
    for (const phrase of transcript.flaggedPhrases) {
      const highlightEl = highlights.find((el) => el.textContent === phrase.text)
      expect(highlightEl).toBeDefined()

      const sidebarEl = sidebarItems.find((el) => el.textContent?.includes(phrase.text))
      expect(sidebarEl).toBeDefined()
    }
  })

  it('count invariant holds for a transcript with many phrases across multiple categories', async () => {
    const transcript = makeTranscript({
      utterances: [
        { speaker: 'agent', text: 'Tell me about your medications and symptoms.', timestamp: 0 },
        {
          speaker: 'patient',
          text: 'I skipped my diuretic and have swollen ankles and chest tightness.',
          timestamp: 5,
        },
      ],
      flaggedPhrases: [
        {
          text: 'skipped my diuretic',
          category: 'medication_adherence',
          reason: 'Diuretic non-adherence increases fluid retention risk',
          utteranceIndex: 1,
        },
        {
          text: 'swollen ankles',
          category: 'symptom_worsening',
          reason: 'Peripheral edema is a sign of decompensated heart failure',
          utteranceIndex: 1,
        },
        {
          text: 'chest tightness',
          category: 'symptom_worsening',
          reason: 'Chest tightness may indicate ischemia or fluid overload',
          utteranceIndex: 1,
        },
      ],
    })
    ;(apiClient as Mock).mockResolvedValue(transcript)

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /risk flags/i })).toBeInTheDocument()
    })

    const highlights = screen.getAllByTestId('flagged-phrase-highlight')
    const sidebarItems = screen.getAllByTestId('risk-flag-item')

    // Core invariant: counts must always be equal
    expect(highlights.length).toBe(sidebarItems.length)
    expect(highlights.length).toBe(transcript.flaggedPhrases.length)
  })
})

// ─── Task 13.10: Non-404 error → ErrorBanner with retry ──────────────────────

describe('13.10 – Show ErrorBanner with retry on non-404 error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an ErrorBanner with role="alert" on a 500 error', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('displays the error message text on a non-404 failure', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 503'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByText(/failed to load call transcript/i)).toBeInTheDocument()
    })
  })

  it('renders a Retry button on a non-404 error', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('Network error'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })

  it('calls refetch when the Retry button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    // First call rejects; second call (after retry) also rejects — we just
    // want to confirm the API was called a second time.
    ;(apiClient as Mock)
      .mockRejectedValueOnce(new Error('API error: 500'))
      .mockRejectedValueOnce(new Error('API error: 500'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalledTimes(2)
    })
  })

  it('does not render the 404 "Call not found" heading on a non-404 error', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.queryByRole('heading', { name: /call not found/i })).not.toBeInTheDocument()
  })

  it('does not render transcript content or skeletons on a non-404 error', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('API error: 500'))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.queryByRole('list', { name: /call transcript/i })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('status', { name: /loading/i })).toHaveLength(0)
  })
})

// ─── Task 13.13: Tier badge color consistent with risk score ─────────────────
//
// Feature: readmission-prevention-dashboard
// Property 1: Risk Tier Derivation Consistency
//
// FOR ALL loaded transcripts, the Risk_Tier badge color SHALL be consistent
// with the Risk_Score value:
//   - green  (bg-green-100 / text-green-700) if score ≤ 3  → Tier 1
//   - amber  (bg-amber-100 / text-amber-700) if score 4–6  → Tier 2
//   - red    (bg-red-100   / text-red-700)   if score ≥ 7  → Tier 3
//
// **Validates: Requirements 3.6, 8.1 (Correctness Properties from Requirements)**

describe('13.13 – Tier badge color consistent with risk score (Property 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Tier 1: score ≤ 3 → green ──────────────────────────────────────────────

  it('shows a green Tier 1 badge when risk score is 0 (minimum)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 0, riskTier: 1 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 1/i)
    expect(badge).toHaveClass('bg-green-100')
    expect(badge).toHaveClass('text-green-700')
    expect(badge).not.toHaveClass('bg-amber-100')
    expect(badge).not.toHaveClass('bg-red-100')
  })

  it('shows a green Tier 1 badge when risk score is 2', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 2, riskTier: 1 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 1/i)
    expect(badge).toHaveClass('bg-green-100')
    expect(badge).toHaveClass('text-green-700')
  })

  it('shows a green Tier 1 badge when risk score is 3 (upper boundary of Tier 1)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 3, riskTier: 1 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 1/i)
    expect(badge).toHaveClass('bg-green-100')
    expect(badge).toHaveClass('text-green-700')
    expect(badge).not.toHaveClass('bg-amber-100')
    expect(badge).not.toHaveClass('bg-red-100')
  })

  // ── Tier 2: score 4–6 → amber ──────────────────────────────────────────────

  it('shows an amber Tier 2 badge when risk score is 4 (lower boundary of Tier 2)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 4, riskTier: 2 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 2/i)
    expect(badge).toHaveClass('bg-amber-100')
    expect(badge).toHaveClass('text-amber-700')
    expect(badge).not.toHaveClass('bg-green-100')
    expect(badge).not.toHaveClass('bg-red-100')
  })

  it('shows an amber Tier 2 badge when risk score is 5', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 5, riskTier: 2 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 2/i)
    expect(badge).toHaveClass('bg-amber-100')
    expect(badge).toHaveClass('text-amber-700')
  })

  it('shows an amber Tier 2 badge when risk score is 6 (upper boundary of Tier 2)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 6, riskTier: 2 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 2/i)
    expect(badge).toHaveClass('bg-amber-100')
    expect(badge).toHaveClass('text-amber-700')
    expect(badge).not.toHaveClass('bg-green-100')
    expect(badge).not.toHaveClass('bg-red-100')
  })

  // ── Tier 3: score ≥ 7 → red ────────────────────────────────────────────────

  it('shows a red Tier 3 badge when risk score is 7 (lower boundary of Tier 3)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 7, riskTier: 3 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 3/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 3/i)
    expect(badge).toHaveClass('bg-red-100')
    expect(badge).toHaveClass('text-red-700')
    expect(badge).not.toHaveClass('bg-green-100')
    expect(badge).not.toHaveClass('bg-amber-100')
  })

  it('shows a red Tier 3 badge when risk score is 9', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 9, riskTier: 3 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 3/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 3/i)
    expect(badge).toHaveClass('bg-red-100')
    expect(badge).toHaveClass('text-red-700')
  })

  it('shows a red Tier 3 badge when risk score is 13 (high-end unbounded score)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 13, riskTier: 3 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 3/i)).toBeInTheDocument()
    })

    const badge = screen.getByLabelText(/risk tier 3/i)
    expect(badge).toHaveClass('bg-red-100')
    expect(badge).toHaveClass('text-red-700')
    expect(badge).not.toHaveClass('bg-green-100')
    expect(badge).not.toHaveClass('bg-amber-100')
  })

  // ── Boundary: score 3 → Tier 1, score 4 → Tier 2 ──────────────────────────

  it('correctly distinguishes Tier 1 (score 3) from Tier 2 (score 4) at the boundary', async () => {
    // Score 3 → green
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 3, riskTier: 1 }))
    const { unmount } = renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/risk tier 1/i)).toHaveClass('bg-green-100')
    unmount()

    // Score 4 → amber
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 4, riskTier: 2 }))
    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/risk tier 2/i)).toHaveClass('bg-amber-100')
  })

  // ── Boundary: score 6 → Tier 2, score 7 → Tier 3 ──────────────────────────

  it('correctly distinguishes Tier 2 (score 6) from Tier 3 (score 7) at the boundary', async () => {
    // Score 6 → amber
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 6, riskTier: 2 }))
    const { unmount } = renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/risk tier 2/i)).toHaveClass('bg-amber-100')
    unmount()

    // Score 7 → red
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 7, riskTier: 3 }))
    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 3/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/risk tier 3/i)).toHaveClass('bg-red-100')
  })

  // ── Badge label text matches tier ──────────────────────────────────────────

  it('badge label text reads "Tier 1" for score ≤ 3', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 1, riskTier: 1 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/risk tier 1/i)).toHaveTextContent('Tier 1')
  })

  it('badge label text reads "Tier 2" for score 4–6', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 5, riskTier: 2 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 2/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/risk tier 2/i)).toHaveTextContent('Tier 2')
  })

  it('badge label text reads "Tier 3" for score ≥ 7', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ riskScore: 8, riskTier: 3 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByLabelText(/risk tier 3/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/risk tier 3/i)).toHaveTextContent('Tier 3')
  })

  // ── Badge derives tier from riskScore (not from riskTier field) ────────────
  //
  // The page calls deriveRiskTier(data.riskScore) to compute the tier passed
  // to RiskTierBadge, so the badge color is always driven by the score value.

  it('badge color is driven by riskScore via deriveRiskTier, not the riskTier field', async () => {
    // riskScore=2 → deriveRiskTier returns 1 → green badge, regardless of riskTier field
    ;(apiClient as Mock).mockResolvedValue(
      makeTranscript({ riskScore: 2, riskTier: 2 /* intentionally mismatched */ }),
    )

    renderTranscriptViewer()

    await waitFor(() => {
      // The badge should reflect the score (Tier 1 / green), not the riskTier field
      expect(screen.getByLabelText(/risk tier 1/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/risk tier 1/i)).toHaveClass('bg-green-100')
    expect(screen.queryByLabelText(/risk tier 2/i)).not.toBeInTheDocument()
  })
})

// ─── Task 13.12: "Low Confidence" badge visible iff confidence < 0.6 ──────────
//
// Feature: readmission-prevention-dashboard
// Property 5: Low Confidence Warning Badge Consistency
//
// For any call transcript with a `confidence` value in the range [0.0, 1.0],
// the "Low Confidence" warning badge SHALL be visible if and only if
// `confidence < 0.6`. The badge SHALL never appear when `confidence ≥ 0.6`,
// and SHALL always appear when `confidence < 0.6`.
//
// **Validates: Requirements Property 5**

describe('13.12 – "Low Confidence" badge visible iff confidence < 0.6 (Property 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Badge NOT shown when confidence ≥ 0.6 ──────────────────────────────────

  it('does NOT show the badge when confidence is exactly 0.6 (boundary — strict less-than)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.6 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('confidence-percentage')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('low-confidence-badge')).not.toBeInTheDocument()
  })

  it('does NOT show the badge when confidence is 0.7', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.7 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('confidence-percentage')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('low-confidence-badge')).not.toBeInTheDocument()
  })

  it('does NOT show the badge when confidence is 1.0 (maximum)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 1.0 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('confidence-percentage')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('low-confidence-badge')).not.toBeInTheDocument()
  })

  // ── Badge IS shown when confidence < 0.6 ───────────────────────────────────

  it('shows the badge when confidence is 0.59 (just below boundary)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.59 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('low-confidence-badge')).toHaveTextContent('Low Confidence')
  })

  it('shows the badge when confidence is 0.3', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.3 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('low-confidence-badge')).toHaveTextContent('Low Confidence')
  })

  it('shows the badge when confidence is 0.0 (minimum)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.0 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('low-confidence-badge')).toHaveTextContent('Low Confidence')
  })

  // ── Confidence percentage is always displayed ───────────────────────────────

  it('always displays the confidence percentage when badge is shown (confidence < 0.6)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.45 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('confidence-percentage')).toBeInTheDocument()
    })

    expect(screen.getByTestId('confidence-percentage')).toHaveTextContent('45%')
    expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument()
  })

  it('always displays the confidence percentage when badge is NOT shown (confidence ≥ 0.6)', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.85 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('confidence-percentage')).toBeInTheDocument()
    })

    expect(screen.getByTestId('confidence-percentage')).toHaveTextContent('85%')
    expect(screen.queryByTestId('low-confidence-badge')).not.toBeInTheDocument()
  })

  // ── Badge has correct accessible label when visible ─────────────────────────

  it('badge has aria-label="Low Confidence warning" when visible', async () => {
    ;(apiClient as Mock).mockResolvedValue(makeTranscript({ confidence: 0.4 }))

    renderTranscriptViewer()

    await waitFor(() => {
      expect(screen.getByTestId('low-confidence-badge')).toBeInTheDocument()
    })

    expect(screen.getByTestId('low-confidence-badge')).toHaveAttribute(
      'aria-label',
      'Low Confidence warning',
    )
  })
})
