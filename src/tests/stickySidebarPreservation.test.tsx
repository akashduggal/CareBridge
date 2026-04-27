/**
 * Preservation Property Tests — Sticky Sidebar Layout
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation — Mobile/Tablet Layout and Sidebar Content Unchanged
 *
 * These tests capture baseline behavior on UNFIXED code. They must PASS before
 * the fix is applied, and continue to PASS after the fix — confirming no regressions.
 *
 * Properties tested:
 *   2a: Mobile header has `desktop:hidden` class for all component states
 *   2b: Sidebar aside has `hidden` base class and `desktop:flex` responsive class
 *   2c: Reconnecting banner renders with `sticky`, `top-0`, `z-50` classes
 *   2d: Connection-failed banner renders with `sticky`, `top-0`, `z-50` classes
 *   2e: Sidebar contains "CareBridge" text, navigation with links, and Sign Out button
 *   2f: Sidebar contains "Demo" badge when demo mode is active
 */

import { describe, expect, vi, beforeEach } from 'vitest'
import { test as fcTest } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
}))

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

// ─── Mock useWebSocket ────────────────────────────────────────────────────────

vi.mock('@/contexts/WebSocketContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/WebSocketContext')>()
  return { ...actual, useWebSocket: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { AppShell } from '@/components/AppShell'
import type { Mock } from 'vitest'
import type { AuthContextValue, WebSocketContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'demo@example.com' } as unknown as User

function mockAuth() {
  ;(useAuth as Mock).mockReturnValue({
    user: fakeUser,
    role: 'admin',
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function mockWs(reconnecting: boolean, connectionAttempts: number) {
  ;(useWebSocket as Mock).mockReturnValue({
    connected: !reconnecting && connectionAttempts < 5,
    reconnecting,
    connectionAttempts,
    lastEventId: null,
    lastDischargeCreatedId: null,
  } satisfies WebSocketContextValue)
}

function renderAppShell(demoMode: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const path = demoMode ? '/dashboard?demo=true' : '/dashboard'
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Component state: demo mode on/off, reconnecting on/off, connectionAttempts 0–10 */
const componentStateArb = fc.record({
  demoMode: fc.boolean(),
  reconnecting: fc.boolean(),
  connectionAttempts: fc.integer({ min: 0, max: 10 }),
})

/** Connection state where reconnecting=true */
const reconnectingStateArb = fc.record({
  demoMode: fc.boolean(),
  reconnecting: fc.constant(true),
  connectionAttempts: fc.integer({ min: 0, max: 10 }),
})

/** Connection state where reconnecting=false AND connectionAttempts >= 5 (connection failed) */
const connectionFailedStateArb = fc.record({
  demoMode: fc.boolean(),
  reconnecting: fc.constant(false),
  connectionAttempts: fc.integer({ min: 5, max: 10 }),
})

/** Component state where demo mode is active */
const demoModeActiveStateArb = fc.record({
  demoMode: fc.constant(true),
  reconnecting: fc.boolean(),
  connectionAttempts: fc.integer({ min: 0, max: 10 }),
})

// ─── Property 2a: Mobile header has desktop:hidden ────────────────────────────

describe('Property 2a: Mobile header has desktop:hidden class', () => {
  /**
   * Validates: Requirements 3.1
   *
   * For all component states (demo mode, connection states), the mobile header
   * SHALL have `desktop:hidden` class.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([componentStateArb], { numRuns: 10 })(
    'For all component states, the mobile header SHALL have desktop:hidden class',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      // The mobile header contains the hamburger button
      const hamburgerBtn = document.querySelector('button[aria-label="Open navigation menu"]')
      expect(hamburgerBtn).not.toBeNull()

      const header = hamburgerBtn!.closest('header')
      expect(header).not.toBeNull()
      expect(header!.className).toContain('desktop:hidden')

      unmount()
    }
  )
})

// ─── Property 2b: Sidebar aside has hidden base and desktop:flex ──────────────

describe('Property 2b: Sidebar aside has hidden base class and desktop:flex responsive class', () => {
  /**
   * Validates: Requirements 3.1
   *
   * For all component states, the sidebar aside SHALL have `hidden` as a base
   * class and `desktop:flex` as a responsive class.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([componentStateArb], { numRuns: 10 })(
    'For all component states, the sidebar aside SHALL have hidden base class and desktop:flex responsive class',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()

      const classes = sidebar!.className
      expect(classes).toContain('hidden')
      expect(classes).toContain('desktop:flex')

      unmount()
    }
  )
})

// ─── Property 2c: Reconnecting banner has sticky top-0 z-50 ──────────────────

describe('Property 2c: Reconnecting banner has sticky, top-0, z-50 classes', () => {
  /**
   * Validates: Requirements 3.3
   *
   * For all connection states where reconnecting=true, the reconnecting banner
   * SHALL render with `sticky`, `top-0`, `z-50` classes.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([reconnectingStateArb], { numRuns: 10 })(
    'For all states where reconnecting=true, the reconnecting banner SHALL have sticky, top-0, z-50 classes',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      // The reconnecting banner has role="status"
      const banner = document.querySelector('[role="status"]')
      expect(banner).not.toBeNull()

      const classes = banner!.className
      expect(classes).toContain('sticky')
      expect(classes).toContain('top-0')
      expect(classes).toContain('z-50')

      unmount()
    }
  )
})

// ─── Property 2d: Connection-failed banner has sticky top-0 z-50 ─────────────

describe('Property 2d: Connection-failed banner has sticky, top-0, z-50 classes', () => {
  /**
   * Validates: Requirements 3.3
   *
   * For all connection states where reconnecting=false AND connectionAttempts >= 5,
   * the connection-failed banner SHALL render with `sticky`, `top-0`, `z-50` classes.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([connectionFailedStateArb], { numRuns: 10 })(
    'For all states where reconnecting=false AND connectionAttempts >= 5, the connection-failed banner SHALL have sticky, top-0, z-50 classes',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      // The connection-failed banner has role="alert"
      const banner = document.querySelector('[role="alert"]')
      expect(banner).not.toBeNull()

      const classes = banner!.className
      expect(classes).toContain('sticky')
      expect(classes).toContain('top-0')
      expect(classes).toContain('z-50')

      unmount()
    }
  )
})

// ─── Property 2e: Sidebar contains branding, nav, and Sign Out ────────────────

describe('Property 2e: Sidebar contains CareBridge text, navigation, and Sign Out button', () => {
  /**
   * Validates: Requirements 3.2, 3.4
   *
   * For all component states, the sidebar SHALL contain "CareBridge" text,
   * a navigation element with links, and a Sign Out button.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([componentStateArb], { numRuns: 10 })(
    'For all component states, the sidebar SHALL contain CareBridge text, a nav element with links, and a Sign Out button',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()

      // "CareBridge" branding text in sidebar
      const sidebarEl = sidebar as HTMLElement
      expect(within(sidebarEl).getByText('CareBridge')).toBeTruthy()

      // Navigation element with links
      const nav = sidebarEl.querySelector('nav')
      expect(nav).not.toBeNull()
      const links = nav!.querySelectorAll('a')
      expect(links.length).toBeGreaterThan(0)

      // Sign Out button (icon-only button with aria-label)
      const signOutBtn = within(sidebarEl).getByRole('button', { name: /sign out/i })
      expect(signOutBtn).toBeTruthy()

      unmount()
    }
  )
})

// ─── Property 2f: Demo badge in sidebar when demo mode active ─────────────────

describe('Property 2f: Sidebar contains Demo badge when demo mode is active', () => {
  /**
   * Validates: Requirements 3.4
   *
   * For all component states where demo mode is active, the sidebar SHALL
   * contain a "Demo" badge.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([demoModeActiveStateArb], { numRuns: 10 })(
    'For all states where demo mode is active, the sidebar SHALL contain a Demo badge',
    (state) => {
      const { demoMode, reconnecting, connectionAttempts } = state
      mockAuth()
      mockWs(reconnecting, connectionAttempts)

      const { unmount } = renderAppShell(demoMode)

      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()

      const sidebarEl = sidebar as HTMLElement
      expect(within(sidebarEl).getByText('Demo')).toBeTruthy()

      unmount()
    }
  )
})
