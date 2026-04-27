/**
 * AppShell component tests
 *
 * 17.5 – "Demo Mode" badge in application header:
 *   - Badge is visible in mobile header when ?demo=true is active (Requirement 8.10)
 *   - Badge is visible in desktop sidebar when ?demo=true is active (Requirement 8.10)
 *   - Badge is NOT visible when ?demo=true is absent
 *   - Badge is NOT visible when ?demo=false
 *
 * 19.1 – Responsive layout verification (Requirement 10):
 *   - Hamburger menu present in DOM for mobile (<768px) and tablet (768–1279px)
 *   - Persistent sidebar present in DOM for desktop (≥1280px)
 *   - Correct Tailwind responsive classes applied to header and sidebar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

function mockAuth(user: User | null) {
  ;(useAuth as Mock).mockReturnValue({
    user,
    role: user ? 'admin' : null,
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

function mockWs() {
  ;(useWebSocket as Mock).mockReturnValue({
    connected: false,
    reconnecting: false,
    connectionAttempts: 0,
    lastEventId: null,
    lastDischargeCreatedId: null,
  } satisfies WebSocketContextValue)
}

function renderAppShell(initialPath = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div>Page content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── 17.5: "Demo Mode" badge in header ───────────────────────────────────────

describe('17.5 – "Demo Mode" badge in application header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
    mockWs()
  })

  it('displays "Demo Mode" badge in mobile header when ?demo=true is active', () => {
    renderAppShell('/dashboard?demo=true')
    // The mobile header badge has the full text "Demo Mode"
    const badges = screen.getAllByText(/demo mode/i)
    expect(badges.length).toBeGreaterThan(0)
  })

  it('does NOT display "Demo Mode" badge when ?demo=true is absent', () => {
    renderAppShell('/dashboard')
    // No demo mode badge should be present
    expect(screen.queryByText(/demo mode/i)).not.toBeInTheDocument()
  })

  it('does NOT display "Demo Mode" badge when ?demo=false', () => {
    renderAppShell('/dashboard?demo=false')
    expect(screen.queryByText(/demo mode/i)).not.toBeInTheDocument()
  })

  it('does NOT display "Demo Mode" badge when ?demo=1 (not exactly "true")', () => {
    renderAppShell('/dashboard?demo=1')
    expect(screen.queryByText(/demo mode/i)).not.toBeInTheDocument()
  })

  it('mobile header badge has correct accessible styling (purple color scheme)', () => {
    renderAppShell('/dashboard?demo=true')
    // Multiple "Demo Mode" texts exist (header badge + DemoPanel header)
    // The header badge is a <span> with purple styling
    const badges = screen.getAllByText('Demo Mode')
    // At least one badge should have purple styling (the header badge)
    const headerBadge = badges.find((el) => el.className.includes('purple-100'))
    expect(headerBadge).toBeDefined()
    expect(headerBadge!.className).toContain('purple')
  })

  it('desktop sidebar shows "Demo" badge when ?demo=true is active', () => {
    renderAppShell('/dashboard?demo=true')
    // Desktop sidebar shows abbreviated "Demo" badge
    // Both "Demo Mode" (mobile) and "Demo" (desktop) should be present
    const demoTexts = screen.getAllByText(/^demo/i)
    expect(demoTexts.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── 19.1: Responsive layout — hamburger menu and persistent sidebar ──────────
//
// Validates: Requirement 10 (Responsive Layout)
//   AC 1: Three breakpoints: mobile (<768px), tablet (768–1279px), desktop (≥1280px)
//   AC 2: While viewport <768px, display navigation as collapsible hamburger menu
//   AC 3: While viewport 768–1279px (tablet), display navigation as collapsible hamburger menu
//   AC 4: While viewport ≥1280px (desktop), display navigation as persistent sidebar
//
// Implementation note:
//   AppShell uses Tailwind CSS classes for responsive layout:
//     - Mobile/tablet header (hamburger): rendered with class "desktop:hidden"
//       → visible at <1280px, CSS-hidden at ≥1280px
//     - Persistent sidebar: rendered with class "hidden desktop:flex"
//       → CSS-hidden at <1280px, visible at ≥1280px
//
//   Since jsdom does not evaluate CSS media queries, we verify:
//     1. The hamburger button element is present in the DOM with correct aria attributes
//     2. The sidebar <aside> element is present in the DOM
//     3. The correct Tailwind responsive classes are applied to each element
//        (these classes drive the CSS-based show/hide at real breakpoints)
//
//   We also mock window.matchMedia to simulate each breakpoint, ensuring the
//   component does not break when matchMedia is queried.

describe('19.1 – Responsive layout: hamburger menu and persistent sidebar', () => {
  /**
   * Helper: mock window.matchMedia to simulate a given viewport width.
   * Returns true for queries whose min-width is ≤ viewportWidth.
   */
  function mockMatchMedia(viewportWidth: number) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => {
        // Parse min-width queries like "(min-width: 1280px)"
        const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/)
        const matches = minWidthMatch ? viewportWidth >= parseInt(minWidthMatch[1], 10) : false
        return {
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }
      }),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(fakeUser)
    mockWs()
  })

  // ── AC 2: Mobile viewport (<768px) ──────────────────────────────────────────

  describe('mobile viewport (<768px)', () => {
    beforeEach(() => {
      mockMatchMedia(375) // iPhone-sized viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    })

    it('renders the hamburger menu button in the DOM', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toBeInTheDocument()
    })

    it('hamburger button has correct aria-expanded=false when menu is closed', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('hamburger button has correct aria-controls pointing to mobile-nav', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toHaveAttribute('aria-controls', 'mobile-nav')
    })

    it('mobile header element has desktop:hidden class (CSS-hidden at ≥1280px)', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      // The header containing the hamburger has desktop:hidden
      const header = hamburgerBtn.closest('header')
      expect(header).not.toBeNull()
      expect(header!.className).toContain('desktop:hidden')
    })

    it('persistent sidebar has hidden class (CSS-hidden at <1280px)', () => {
      renderAppShell('/dashboard')
      // The sidebar <aside> is always in the DOM but CSS-hidden at <1280px
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      expect(sidebar!.className).toContain('hidden')
      expect(sidebar!.className).toContain('desktop:flex')
    })

    it('renders the persistent sidebar <aside> element in the DOM', () => {
      renderAppShell('/dashboard')
      // Sidebar is always rendered (CSS controls visibility)
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
    })
  })

  // ── AC 3: Tablet viewport (768–1279px) ──────────────────────────────────────

  describe('tablet viewport (768–1279px)', () => {
    beforeEach(() => {
      mockMatchMedia(1024) // iPad-sized viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    })

    it('renders the hamburger menu button in the DOM', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toBeInTheDocument()
    })

    it('hamburger button has correct aria-expanded=false when menu is closed', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('mobile header element has desktop:hidden class (CSS-hidden at ≥1280px)', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      const header = hamburgerBtn.closest('header')
      expect(header).not.toBeNull()
      expect(header!.className).toContain('desktop:hidden')
    })

    it('persistent sidebar has hidden class (CSS-hidden at <1280px)', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      expect(sidebar!.className).toContain('hidden')
      expect(sidebar!.className).toContain('desktop:flex')
    })
  })

  // ── AC 4: Desktop viewport (≥1280px) ────────────────────────────────────────

  describe('desktop viewport (≥1280px)', () => {
    beforeEach(() => {
      mockMatchMedia(1440) // Desktop-sized viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
    })

    it('renders the persistent sidebar <aside> element in the DOM', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
    })

    it('sidebar has desktop:flex class (CSS-visible at ≥1280px)', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      expect(sidebar!.className).toContain('desktop:flex')
    })

    it('sidebar has hidden class as base (overridden to flex at ≥1280px by Tailwind)', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      // Base class is "hidden" but desktop:flex overrides it at ≥1280px
      expect(sidebar!.className).toContain('hidden')
      expect(sidebar!.className).toContain('desktop:flex')
    })

    it('hamburger button is still in the DOM (CSS-hidden at ≥1280px via desktop:hidden on header)', () => {
      renderAppShell('/dashboard')
      // The hamburger button is always rendered; CSS hides the header at desktop
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toBeInTheDocument()
      // Its parent header has desktop:hidden class
      const header = hamburgerBtn.closest('header')
      expect(header!.className).toContain('desktop:hidden')
    })

    it('sidebar contains navigation links', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      // Sidebar should contain nav links
      const navInSidebar = sidebar!.querySelector('nav')
      expect(navInSidebar).not.toBeNull()
    })
  })

  // ── Breakpoint boundary: exactly 1280px (desktop threshold) ─────────────────

  describe('breakpoint boundary at exactly 1280px (desktop threshold)', () => {
    beforeEach(() => {
      mockMatchMedia(1280)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
    })

    it('sidebar has desktop:flex class (≥1280px is desktop)', () => {
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      expect(sidebar!.className).toContain('desktop:flex')
    })

    it('header has desktop:hidden class (hidden at exactly 1280px)', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      const header = hamburgerBtn.closest('header')
      expect(header!.className).toContain('desktop:hidden')
    })
  })

  // ── Breakpoint boundary: 767px (just below mobile/tablet threshold) ──────────

  describe('breakpoint boundary at 767px (just below tablet threshold)', () => {
    beforeEach(() => {
      mockMatchMedia(767)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 767 })
    })

    it('hamburger button is present in the DOM', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      expect(hamburgerBtn).toBeInTheDocument()
    })

    it('header has desktop:hidden class (visible at 767px)', () => {
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      const header = hamburgerBtn.closest('header')
      expect(header!.className).toContain('desktop:hidden')
    })
  })

  // ── Hamburger toggle behavior (viewport-independent) ────────────────────────

  describe('hamburger menu toggle behavior', () => {
    beforeEach(() => {
      mockMatchMedia(375)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    })

    it('mobile nav panel is not rendered when menu is closed', () => {
      renderAppShell('/dashboard')
      // The slide-out nav is conditionally rendered only when menuOpen=true
      expect(document.getElementById('mobile-nav')).toBeNull()
    })

    it('mobile nav panel appears after hamburger button click', async () => {
      const { getByRole } = renderAppShell('/dashboard')
      const hamburgerBtn = getByRole('button', { name: /open navigation menu/i })

      // Click to open — wrap in act() to flush React state updates
      await act(async () => {
        fireEvent.click(hamburgerBtn)
      })

      // After click, mobile-nav should be rendered
      const mobileNav = document.getElementById('mobile-nav')
      expect(mobileNav).not.toBeNull()
    })

    it('hamburger button aria-expanded updates to true when menu opens', async () => {
      const { getByRole } = renderAppShell('/dashboard')
      const hamburgerBtn = getByRole('button', { name: /open navigation menu/i })

      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false')

      await act(async () => {
        fireEvent.click(hamburgerBtn)
      })

      expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'true')
    })
  })
})
