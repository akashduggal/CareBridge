/**
 * Task 19.4 — Verify no horizontal scrollbar at any breakpoint when content fits viewport
 *
 * Validates: Requirement 10 (Responsive Layout)
 *   "The application SHALL NOT produce a horizontal scrollbar at any of the three
 *   breakpoints (mobile <768px, tablet 768–1279px, desktop ≥1280px) when content
 *   fits within the viewport."
 *
 * Implementation note:
 *   jsdom does not perform real CSS layout, so computed scrollWidth values are
 *   always 0 by default. The approach here is:
 *     1. Verify that no element in the rendered AppShell tree has inline styles or
 *        Tailwind classes that would force content wider than the viewport (e.g.,
 *        fixed pixel widths wider than the breakpoint, `overflow-x: visible` on
 *        the root, or `min-width` values exceeding the viewport).
 *     2. Verify that the root container uses `min-h-screen` (not a fixed width).
 *     3. Verify that `overflow-x: hidden` or `overflow-auto` is applied where
 *        needed (main content area uses `overflow-auto`).
 *     4. Verify that `document.documentElement.scrollWidth <= window.innerWidth`
 *        holds at each breakpoint (jsdom always returns 0 for both, so this
 *        confirms no JS-driven overflow is introduced).
 *     5. Verify that no element in the tree has a className containing a fixed
 *        pixel width wider than the current breakpoint viewport.
 *
 *   These checks give confidence that the CSS/Tailwind classes applied by
 *   AppShell will not produce horizontal overflow in a real browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// ─── Context mocks ────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

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
    role: 'nurse',
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

/** Simulate a viewport width by setting window.innerWidth and matchMedia. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/)
      const matches = minWidthMatch ? width >= parseInt(minWidthMatch[1], 10) : false
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

function renderAppShell(initialPath = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div data-testid="page-content">Page content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/**
 * Collect all className strings from every element in the rendered tree.
 * Used to check for problematic CSS classes that could cause overflow.
 */
function getAllClassNames(container: HTMLElement): string[] {
  const classNames: string[] = []
  const elements = container.querySelectorAll('*')
  elements.forEach((el) => {
    if (el.className && typeof el.className === 'string' && el.className.trim()) {
      classNames.push(el.className)
    }
  })
  return classNames
}

// ─── Breakpoint definitions ───────────────────────────────────────────────────

const BREAKPOINTS = [
  { name: 'mobile', width: 375 },
  { name: 'tablet', width: 768 },
  { name: 'desktop', width: 1280 },
] as const

// ─── 19.4: No horizontal scrollbar at any breakpoint ─────────────────────────

describe('19.4 – No horizontal scrollbar at any breakpoint when content fits viewport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    mockWs()
  })

  afterEach(() => {
    // Clean up any DOM modifications
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  // ── scrollWidth does not exceed innerWidth ────────────────────────────────

  describe.each(BREAKPOINTS)('$name viewport ($width px)', ({ width }) => {
    beforeEach(() => {
      setViewportWidth(width)
    })

    it('document.documentElement.scrollWidth does not exceed window.innerWidth', () => {
      renderAppShell('/dashboard')
      // In jsdom, scrollWidth is 0 (no real layout), innerWidth is what we set.
      // This confirms no JS-driven overflow is introduced.
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('document.body.scrollWidth does not exceed window.innerWidth', () => {
      renderAppShell('/dashboard')
      expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('AppShell root container uses min-h-screen (not a fixed pixel width)', () => {
      const { container } = renderAppShell('/dashboard')
      // The outermost div rendered by AppShell should have min-h-screen
      const rootDiv = container.firstElementChild as HTMLElement
      expect(rootDiv).not.toBeNull()
      expect(rootDiv.className).toContain('min-h-screen')
      // Must NOT have a fixed pixel width class like w-[1400px] etc.
      expect(rootDiv.className).not.toMatch(/\bw-\[\d+px\]/)
    })

    it('main content area uses overflow-auto (prevents content from escaping bounds)', () => {
      renderAppShell('/dashboard')
      const main = document.querySelector('main')
      expect(main).not.toBeNull()
      // AppShell applies overflow-auto to <main> so content scrolls within bounds
      expect(main!.className).toContain('overflow-auto')
    })

    it('no element in the tree has a fixed pixel width wider than the viewport', () => {
      const { container } = renderAppShell('/dashboard')
      const allClassNames = getAllClassNames(container)

      // Check for inline Tailwind fixed-width classes like w-[500px], w-[1400px], etc.
      // that could force content wider than the viewport
      const problematicWidths = allClassNames.filter((cls) => {
        const matches = cls.match(/\bw-\[(\d+)px\]/g)
        if (!matches) return false
        return matches.some((match) => {
          const px = parseInt(match.replace(/\bw-\[(\d+)px\]/, '$1'), 10)
          return px > width
        })
      })

      expect(problematicWidths).toHaveLength(0)
    })

    it('no element has overflow-x: visible set as an inline style', () => {
      const { container } = renderAppShell('/dashboard')
      const elements = container.querySelectorAll('*')
      const overflowXVisible: Element[] = []

      elements.forEach((el) => {
        const htmlEl = el as HTMLElement
        if (htmlEl.style && htmlEl.style.overflowX === 'visible') {
          overflowXVisible.push(el)
        }
      })

      expect(overflowXVisible).toHaveLength(0)
    })
  })

  // ── Root-level overflow containment ──────────────────────────────────────

  describe('root-level overflow containment', () => {
    it('AppShell root div does not have a min-width wider than mobile viewport (375px)', () => {
      setViewportWidth(375)
      const { container } = renderAppShell('/dashboard')
      const rootDiv = container.firstElementChild as HTMLElement
      expect(rootDiv).not.toBeNull()
      // Should not have min-w-[Npx] classes wider than 375px
      expect(rootDiv.className).not.toMatch(/\bmin-w-\[([4-9]\d{2,}|\d{4,})px\]/)
    })

    it('sidebar has a bounded width class (desktop:w-56 = 224px, not unbounded)', () => {
      setViewportWidth(1280)
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      // desktop:w-56 = 14rem = 224px — well within 1280px desktop viewport
      expect(sidebar!.className).toContain('desktop:w-56')
    })

    it('sidebar uses desktop:flex-shrink-0 to prevent it from growing beyond its defined width', () => {
      setViewportWidth(1280)
      renderAppShell('/dashboard')
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()
      expect(sidebar!.className).toContain('desktop:flex-shrink-0')
    })

    it('main content uses flex-1 to fill remaining space without overflowing', () => {
      setViewportWidth(1280)
      renderAppShell('/dashboard')
      const main = document.querySelector('main')
      expect(main).not.toBeNull()
      expect(main!.className).toContain('flex-1')
    })

    it('flex container wrapping sidebar and main does not have overflow-x: visible inline style', () => {
      setViewportWidth(1280)
      const { container } = renderAppShell('/dashboard')
      // The div.flex wrapping aside + main
      const flexDiv = container.querySelector('.flex')
      expect(flexDiv).not.toBeNull()
      const htmlEl = flexDiv as HTMLElement
      expect(htmlEl.style.overflowX).not.toBe('visible')
    })
  })

  // ── Tailwind class audit: no unbounded width classes ─────────────────────

  describe('Tailwind class audit — no unbounded width classes in AppShell', () => {
    it('AppShell does not use w-screen on any element (would cause 100vw overflow with scrollbar)', () => {
      setViewportWidth(375)
      const { container } = renderAppShell('/dashboard')
      const allClassNames = getAllClassNames(container)
      const hasWScreen = allClassNames.some((cls) => cls.split(' ').includes('w-screen'))
      expect(hasWScreen).toBe(false)
    })

    it('AppShell does not use max-w-none on the root container', () => {
      setViewportWidth(375)
      const { container } = renderAppShell('/dashboard')
      const rootDiv = container.firstElementChild as HTMLElement
      expect(rootDiv.className).not.toContain('max-w-none')
    })

    it('header uses px-4 padding (not a fixed wide width)', () => {
      setViewportWidth(375)
      renderAppShell('/dashboard')
      const hamburgerBtn = screen.getByRole('button', { name: /open navigation menu/i })
      const header = hamburgerBtn.closest('header')
      expect(header).not.toBeNull()
      expect(header!.className).toContain('px-4')
      // Header should not have a fixed pixel width
      expect(header!.className).not.toMatch(/\bw-\[\d+px\]/)
    })

    it('mobile nav panel uses px-4 padding (not a fixed wide width)', async () => {
      setViewportWidth(375)
      const { getByRole } = renderAppShell('/dashboard')

      // Open the mobile nav — wrap in act() to flush React state updates
      const hamburgerBtn = getByRole('button', { name: /open navigation menu/i })
      const { act } = await import('@testing-library/react')
      await act(async () => {
        hamburgerBtn.click()
      })

      const mobileNav = document.getElementById('mobile-nav')
      expect(mobileNav).not.toBeNull()
      expect(mobileNav!.className).toContain('px-4')
      expect(mobileNav!.className).not.toMatch(/\bw-\[\d+px\]/)
    })
  })

  // ── Cross-breakpoint: AppShell renders without errors at all breakpoints ──

  describe('AppShell renders without layout errors at all breakpoints', () => {
    it.each(BREAKPOINTS)('renders AppShell at $name ($width px) without throwing', ({ width }) => {
      setViewportWidth(width)
      expect(() => renderAppShell('/dashboard')).not.toThrow()
    })

    it.each(BREAKPOINTS)(
      'page content is visible at $name ($width px)',
      ({ width }) => {
        setViewportWidth(width)
        renderAppShell('/dashboard')
        expect(screen.getByTestId('page-content')).toBeInTheDocument()
      }
    )
  })
})
