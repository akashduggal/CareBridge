/**
 * Bug Condition Exploration Test — Sticky Sidebar Layout
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 *
 * Property 1: Bug Condition — Sidebar Missing Sticky Positioning and Viewport Height at Desktop
 *
 * For all component states (demo mode ∈ {true, false}, reconnecting ∈ {true, false},
 * connectionFailed ∈ {true, false}), rendering AppShell at desktop SHALL produce:
 *   - A sidebar `aside` with classes containing `desktop:sticky`, `desktop:top-0`, and `desktop:h-screen`
 *   - The parent flex container SHALL contain `desktop:h-screen`
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 */

import { describe, expect, vi, beforeEach } from 'vitest'
import { test as fcTest } from '@fast-check/vitest'
import * as fc from 'fast-check'
import { render } from '@testing-library/react'
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

function mockWs(reconnecting: boolean, connectionFailed: boolean) {
  ;(useWebSocket as Mock).mockReturnValue({
    connected: !reconnecting && !connectionFailed,
    reconnecting,
    connectionAttempts: connectionFailed ? 5 : 0,
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

const componentStateArb = fc.record({
  demoMode: fc.boolean(),
  reconnecting: fc.boolean(),
  connectionFailed: fc.boolean(),
})

// ─── Property 1: Bug Condition Exploration ────────────────────────────────────

describe('Property 1: Sidebar sticky positioning and viewport height at desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  fcTest.prop([componentStateArb], { numRuns: 10 })(
    'For all component states, sidebar aside SHALL have desktop:sticky, desktop:top-0, desktop:h-screen and parent flex container SHALL have desktop:h-screen',
    (state) => {
      const { demoMode, reconnecting, connectionFailed } = state
      // Arrange
      mockAuth()
      mockWs(reconnecting, connectionFailed)

      // Act
      const { unmount } = renderAppShell(demoMode)

      // Assert — sidebar aside classes
      const sidebar = document.querySelector('aside')
      expect(sidebar).not.toBeNull()

      const sidebarClasses = sidebar!.className
      expect(sidebarClasses).toContain('desktop:sticky')
      expect(sidebarClasses).toContain('desktop:top-0')
      expect(sidebarClasses).toContain('desktop:h-screen')

      // Assert — parent flex container classes
      const flexContainer = sidebar!.parentElement
      expect(flexContainer).not.toBeNull()
      expect(flexContainer!.className).toContain('desktop:h-screen')

      // Cleanup
      unmount()
    }
  )
})
