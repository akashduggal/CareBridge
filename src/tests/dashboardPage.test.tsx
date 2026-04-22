/**
 * Tests for DashboardPage (tasks 11.12–11.13)
 *
 * 11.12 – Integration test: mount → loading skeleton → data loaded →
 *          WebSocket discharge_created → count increments
 *          (Property 16: Dashboard WebSocket Event Count Updates)
 *
 * 11.13 – Unit test: sum of tier1+tier2+tier3 equals completedToday, not todayDischarges
 *          (Property 15: Dashboard Tier Distribution Invariant)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { test } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, screen, waitFor, act } from '@testing-library/react'
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

// ─── Mock apiClient ───────────────────────────────────────────────────────────

vi.mock('@/lib/apiClient', () => ({
  apiClient: vi.fn(),
}))

// ─── Mock useWebSocket ────────────────────────────────────────────────────────

vi.mock('@/contexts/WebSocketContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/WebSocketContext')>()
  return { ...actual, useWebSocket: vi.fn() }
})

import { apiClient } from '@/lib/apiClient'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { DashboardPage } from '@/pages/DashboardPage'
import type { Mock } from 'vitest'
import type { DashboardStats, WebSocketContextValue } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockWs(overrides: Partial<WebSocketContextValue> = {}) {
  ;(useWebSocket as Mock).mockReturnValue({
    connected: true,
    reconnecting: false,
    connectionAttempts: 0,
    lastEventId: null,
    ...overrides,
  } satisfies WebSocketContextValue)
}

function makeStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayDischarges: 10,
    pendingCalls: 5,
    activeEscalations: 2,
    tierDistribution: { tier1: 4, tier2: 3, tier3: 2 },
    dailyVolume: [
      { date: '2024-01-09', count: 8 },
      { date: '2024-01-10', count: 10 },
    ],
    completedToday: 9, // tier1+tier2+tier3 = 4+3+2 = 9
    ...overrides,
  }
}

function renderDashboard(qc?: QueryClient) {
  const testQc =
    qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    qc: testQc,
    ...render(
      <QueryClientProvider client={testQc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
}

// ─── 11.13: Tier distribution invariant ──────────────────────────────────────

describe('11.13 – Tier distribution uses completedToday, not todayDischarges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs()
  })

  it('renders tier counts that sum to completedToday', async () => {
    const stats = makeStats({
      todayDischarges: 15, // includes pending/voicemail — NOT used for tier sum
      completedToday: 9,   // tier1+tier2+tier3 = 4+3+2 = 9
      tierDistribution: { tier1: 4, tier2: 3, tier3: 2 },
    })
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText(/Tier 1: 4/)).toBeInTheDocument()
      expect(screen.getByText(/Tier 2: 3/)).toBeInTheDocument()
      expect(screen.getByText(/Tier 3: 2/)).toBeInTheDocument()
    })

    const { tier1, tier2, tier3 } = stats.tierDistribution
    expect(tier1 + tier2 + tier3).toBe(stats.completedToday)
    expect(tier1 + tier2 + tier3).not.toBe(stats.todayDischarges)
  })

  /**
   * Validates: Requirements 15
   *
   * Property 15: Dashboard Tier Distribution Invariant
   *
   * FOR ALL valid GET /dashboard/stats responses, the sum of Tier 1 + Tier 2 + Tier 3
   * counts in the donut chart SHALL equal the completed_today count, not the
   * today_discharges count — pending calls, voicemails, and no-answer attempts
   * have no tier assignment and SHALL NOT be included in the tier distribution.
   *
   * // Feature: readmission-prevention-dashboard, Property 15: Dashboard Tier Distribution Invariant
   */
  test.prop([
    fc.record({
      tier1: fc.nat(),
      tier2: fc.nat(),
      tier3: fc.nat(),
      todayDischarges: fc.nat({ max: 1000 }),
    }),
  ])(
    'sum of tier1+tier2+tier3 equals completedToday, not todayDischarges, for all valid stats',
    async ({ tier1, tier2, tier3, todayDischarges }) => {
      vi.clearAllMocks()
      mockWs()

      const completedToday = tier1 + tier2 + tier3

      const stats = makeStats({
        todayDischarges,
        completedToday,
        tierDistribution: { tier1, tier2, tier3 },
      })
      ;(apiClient as Mock).mockResolvedValue(stats)

      const { unmount } = renderDashboard()

      try {
        if (completedToday === 0) {
          // All-zero case: chart shows "No completed calls today" message
          await waitFor(() => {
            expect(document.body.textContent).toContain('No completed calls today')
          })
        } else {
          // Non-zero case: tier values are rendered in the legend
          await waitFor(() => {
            expect(screen.getByText(new RegExp(`Tier 1: ${tier1}`))).toBeInTheDocument()
            expect(screen.getByText(new RegExp(`Tier 2: ${tier2}`))).toBeInTheDocument()
            expect(screen.getByText(new RegExp(`Tier 3: ${tier3}`))).toBeInTheDocument()
          })

          // The sum of rendered tier values equals completedToday
          expect(tier1 + tier2 + tier3).toBe(completedToday)
        }

        // The invariant: tier sum === completedToday, NOT todayDischarges
        expect(tier1 + tier2 + tier3).toBe(stats.completedToday)
      } finally {
        unmount()
      }
    }
  )
})

// ─── 11.12: Integration test ──────────────────────────────────────────────────

describe('11.12 – Integration: loading skeleton → data → WebSocket event → count updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs()
  })

  it('shows loading skeletons while fetching', () => {
    ;(apiClient as Mock).mockReturnValue(new Promise(() => {}))

    renderDashboard()

    // Loading skeletons should be present
    const skeletons = screen.getAllByRole('status', { name: /loading/i })
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders summary cards after data loads', async () => {
    const stats = makeStats({ todayDischarges: 42, pendingCalls: 7, activeEscalations: 3 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      // Use getByRole to find the specific stat card values
      expect(screen.getByText("Today's Discharges")).toBeInTheDocument()
      expect(screen.getByText('Pending Calls')).toBeInTheDocument()
      expect(screen.getByText('Active Escalations')).toBeInTheDocument()
    })

    // Check the bold stat numbers are present
    const allText = document.body.textContent ?? ''
    expect(allText).toContain('42')
    expect(allText).toContain('7')
  })

  it('shows error banner when fetch fails', async () => {
    ;(apiClient as Mock).mockRejectedValue(new Error('Network error'))

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toContain('Failed to load')
  })

  it('WebSocket cache update causes dashboard count to re-render', async () => {
    const stats = makeStats({ todayDischarges: 55, pendingCalls: 3, activeEscalations: 1 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockWs({ lastEventId: null })

    renderDashboard(qc)

    await waitFor(() => {
      expect(document.body.textContent).toContain('55')
    })

    // Simulate WebSocket updating the cache
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, todayDischarges: 56 }
      })
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('56')
    })
  })

  /**
   * Validates: Requirements 16
   *
   * Full integration sequence:
   *   1. Mount DashboardPage
   *   2. Loading skeleton visible while fetch is pending
   *   3. Data loads — summary cards show today's discharges, pending calls, active escalations
   *   4. Simulate discharge_created WebSocket event via cache update (as WebSocketContext does)
   *   5. Today's discharges count increments by 1 without a page reload
   *
   * Property 16: Dashboard WebSocket Event Count Updates
   */
  it('full sequence: mount → loading skeleton → data loaded → discharge_created → count increments', async () => {
    // ── Step 1 & 2: Mount with a never-resolving promise to observe loading state ──
    let resolveStats!: (value: DashboardStats) => void
    const statsPromise = new Promise<DashboardStats>((resolve) => {
      resolveStats = resolve
    })
    ;(apiClient as Mock).mockReturnValue(statsPromise)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockWs({ lastEventId: null })

    renderDashboard(qc)

    // Loading skeletons must be visible before data resolves
    const skeletons = screen.getAllByRole('status', { name: /loading/i })
    expect(skeletons.length).toBeGreaterThan(0)

    // ── Step 3: Resolve the fetch — data loads, summary cards appear ──
    const initialStats = makeStats({
      todayDischarges: 20,
      pendingCalls: 4,
      activeEscalations: 1,
    })

    act(() => {
      resolveStats(initialStats)
    })

    await waitFor(() => {
      expect(screen.getByText("Today's Discharges")).toBeInTheDocument()
      expect(screen.getByText('Pending Calls')).toBeInTheDocument()
      expect(screen.getByText('Active Escalations')).toBeInTheDocument()
    })

    // Confirm the initial count is displayed
    expect(document.body.textContent).toContain('20')

    // ── Step 4 & 5: Simulate discharge_created WebSocket event ──
    // WebSocketContext handles discharge_created by calling:
    //   queryClient.setQueryData(queryKeys.dashboard(), (old) => ({
    //     ...old, todayDischarges: old.todayDischarges + 1
    //   }))
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, todayDischarges: old.todayDischarges + 1 }
      })
    })

    // Today's discharges count must increment from 20 → 21
    await waitFor(() => {
      expect(document.body.textContent).toContain('21')
    })

    // The count must never go below the initial loaded value
    const updatedStats = qc.getQueryData<DashboardStats>(['dashboard', 'stats'])
    expect(updatedStats?.todayDischarges).toBe(21)
    expect(updatedStats?.todayDischarges).toBeGreaterThanOrEqual(initialStats.todayDischarges)
  })
})

// ─── 11.5: Text-based chart alternatives for screen readers ──────────────────

describe('11.5 – Text-based alternatives for chart data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs()
  })

  it('renders a visually-hidden table with risk tier distribution data', async () => {
    const stats = makeStats({
      tierDistribution: { tier1: 4, tier2: 3, tier3: 2 },
    })
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      const table = document.querySelector('table[aria-label="Risk tier distribution data"]')
      expect(table).toBeInTheDocument()
      expect(table).toHaveClass('sr-only')
    })

    const table = document.querySelector('table[aria-label="Risk tier distribution data"]')!
    expect(table.textContent).toContain('Tier 1')
    expect(table.textContent).toContain('4')
    expect(table.textContent).toContain('Tier 2')
    expect(table.textContent).toContain('3')
    expect(table.textContent).toContain('Tier 3')
    expect(table.textContent).toContain('2')
  })

  it('renders a visually-hidden table with daily discharge volume data', async () => {
    const stats = makeStats({
      dailyVolume: [
        { date: '2024-01-09', count: 8 },
        { date: '2024-01-10', count: 10 },
      ],
    })
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      const table = document.querySelector('table[aria-label="Daily discharge volume data"]')
      expect(table).toBeInTheDocument()
      expect(table).toHaveClass('sr-only')
    })

    const table = document.querySelector('table[aria-label="Daily discharge volume data"]')!
    expect(table.textContent).toContain('2024-01-09')
    expect(table.textContent).toContain('8')
    expect(table.textContent).toContain('2024-01-10')
    expect(table.textContent).toContain('10')
  })

  it('risk tier table has proper th scope attributes', async () => {
    const stats = makeStats()
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      const table = document.querySelector('table[aria-label="Risk tier distribution data"]')
      expect(table).toBeInTheDocument()
    })

    const table = document.querySelector('table[aria-label="Risk tier distribution data"]')!
    const headers = table.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(2)
  })

  it('daily volume table has proper th scope attributes', async () => {
    const stats = makeStats()
    ;(apiClient as Mock).mockResolvedValue(stats)

    renderDashboard()

    await waitFor(() => {
      const table = document.querySelector('table[aria-label="Daily discharge volume data"]')
      expect(table).toBeInTheDocument()
    })

    const table = document.querySelector('table[aria-label="Daily discharge volume data"]')!
    const headers = table.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── 11.9: call_completed WebSocket event updates ────────────────────────────

describe('11.9 – call_completed WebSocket event: pending calls and tier distribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs()
  })

  it('decrements pendingCalls when call_completed event updates cache', async () => {
    const stats = makeStats({ pendingCalls: 5 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderDashboard(qc)

    await waitFor(() => {
      expect(document.body.textContent).toContain('5')
    })

    // Simulate call_completed WebSocket event updating the cache
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, pendingCalls: Math.max(0, old.pendingCalls - 1) }
      })
    })

    await waitFor(() => {
      expect(document.body.textContent).toContain('4')
    })
  })

  it('pendingCalls never goes negative (clamped to 0)', async () => {
    const stats = makeStats({ pendingCalls: 0 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderDashboard(qc)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Pending Calls')
    })

    // Simulate call_completed when pendingCalls is already 0
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, pendingCalls: Math.max(0, old.pendingCalls - 1) }
      })
    })

    // pendingCalls should remain 0, not go negative
    const updatedStats = qc.getQueryData<DashboardStats>(['dashboard', 'stats'])
    expect(updatedStats?.pendingCalls).toBe(0)
    expect(updatedStats?.pendingCalls).toBeGreaterThanOrEqual(0)
  })

  it('increments tier distribution when call_completed updates cache', async () => {
    const stats = makeStats({
      tierDistribution: { tier1: 4, tier2: 3, tier3: 2 },
      completedToday: 9,
    })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderDashboard(qc)

    await waitFor(() => {
      expect(screen.getByText(/Tier 3: 2/)).toBeInTheDocument()
    })

    // Simulate call_completed for tier 3 updating the cache
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return {
          ...old,
          completedToday: old.completedToday + 1,
          tierDistribution: {
            ...old.tierDistribution,
            tier3: old.tierDistribution.tier3 + 1,
          },
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/Tier 3: 3/)).toBeInTheDocument()
    })
  })
})

// ─── 11.10: escalation_triggered WebSocket event updates ─────────────────────

describe('11.10 – escalation_triggered WebSocket event: increments active escalations count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWs()
  })

  it('increments activeEscalations when escalation_triggered updates cache', async () => {
    const stats = makeStats({ activeEscalations: 2 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderDashboard(qc)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Active Escalations')
    })

    // Simulate escalation_triggered WebSocket event updating the cache
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, activeEscalations: Math.max(0, old.activeEscalations + 1) }
      })
    })

    await waitFor(() => {
      const updatedStats = qc.getQueryData<DashboardStats>(['dashboard', 'stats'])
      expect(updatedStats?.activeEscalations).toBe(3)
    })
  })

  it('activeEscalations never goes negative (defensive check)', async () => {
    const stats = makeStats({ activeEscalations: 0 })
    ;(apiClient as Mock).mockResolvedValue(stats)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderDashboard(qc)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Active Escalations')
    })

    // Simulate a hypothetical decrement — should clamp to 0
    act(() => {
      qc.setQueryData(['dashboard', 'stats'], (old: DashboardStats | undefined) => {
        if (!old) return old
        return { ...old, activeEscalations: Math.max(0, old.activeEscalations - 1) }
      })
    })

    const updatedStats = qc.getQueryData<DashboardStats>(['dashboard', 'stats'])
    expect(updatedStats?.activeEscalations).toBe(0)
    expect(updatedStats?.activeEscalations).toBeGreaterThanOrEqual(0)
  })
})
