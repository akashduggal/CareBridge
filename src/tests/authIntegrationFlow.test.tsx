// Feature: readmission-prevention-dashboard

/**
 * Integration tests for the Firebase auth flow (task 20.3)
 *
 * Scenario A: Unauthenticated → navigate to /dashboard → redirected to /login
 *             → sign in with Google (valid role) → redirected to /dashboard
 *             → protected content renders
 *
 * Scenario B: Sign-in with no role claim → signed out → error message shown
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Firebase mocks ───────────────────────────────────────────────────────────
// Must be declared before any imports that transitively use firebase/auth

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn(),
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}))

vi.mock('@/lib/apiClient', () => ({
  apiClient: vi.fn().mockResolvedValue({
    todayDischarges: 0,
    pendingCalls: 0,
    activeEscalations: 0,
    tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
    dailyVolume: [],
    completedToday: 0,
  }),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  getIdTokenResult,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

/**
 * Render the minimal route tree needed for the auth integration flow:
 *   /login  → LoginPage (public)
 *   /dashboard → ProtectedRoute → DashboardPage
 *   /       → redirect to /dashboard
 *
 * Uses the real AuthProvider and WebSocketProvider so the full context
 * chain is exercised.
 */
function renderApp(initialPath: string) {
  return render(
    <QueryClientProvider client={makeQc()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <WebSocketProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/**
 * Set up `onAuthStateChanged` to call its callback with `firebaseUser`.
 * If `firebaseUser` is non-null, `getIdTokenResult` is configured to return
 * the provided `claims`.
 */
function simulateAuthState(
  firebaseUser: Partial<User> | null,
  claims: Record<string, unknown> = {}
) {
  ;(onAuthStateChanged as Mock).mockImplementation((_auth, callback: (u: unknown) => void) => {
    Promise.resolve().then(() => {
      if (firebaseUser) {
        ;(getIdTokenResult as Mock).mockResolvedValue({
          claims,
          token: 'mock-token',
          expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
      }
      callback(firebaseUser)
    })
    return vi.fn() // unsubscribe
  })
}

/** A fake Firebase User — only the fields AuthContext actually reads. */
const fakeUser: Partial<User> = {
  uid: 'user-123',
  email: 'nurse@hospital.org',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth integration flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(firebaseSignOut as Mock).mockResolvedValue(undefined)
  })

  // ── Scenario A ──────────────────────────────────────────────────────────────

  describe('Scenario A: unauthenticated → /login → sign in → /dashboard', () => {
    it('redirects unauthenticated user from /dashboard to /login with redirect param', async () => {
      // Auth resolves with no user (unauthenticated)
      simulateAuthState(null)

      renderApp('/dashboard')

      // After auth resolves, ProtectedRoute redirects to /login?redirect=/dashboard
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /sign in with google/i })
        ).toBeInTheDocument()
      })

      // Dashboard content must NOT be visible
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    })

    it('shows loading spinner while auth is resolving', () => {
      // onAuthStateChanged never calls its callback → stays loading
      ;(onAuthStateChanged as Mock).mockImplementation(() => vi.fn())

      renderApp('/dashboard')

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument()
    })

    it('after sign-in with valid role, user is redirected to /dashboard and protected content renders', async () => {
      const user = userEvent.setup()

      // Phase 1: start unauthenticated
      simulateAuthState(null)

      renderApp('/dashboard')

      // Wait for redirect to /login
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /sign in with google/i })
        ).toBeInTheDocument()
      })

      // Phase 2: simulate successful sign-in
      // signInWithPopup resolves, then onAuthStateChanged fires with the user
      ;(signInWithPopup as Mock).mockResolvedValue({ user: fakeUser })

      // After signInWithPopup resolves, AuthContext's onAuthStateChanged fires
      // with the authenticated user. We re-configure it here to simulate that.
      ;(onAuthStateChanged as Mock).mockImplementation((_auth, callback: (u: unknown) => void) => {
        // Immediately call with null (initial state already rendered), then
        // after signInWithPopup is called the component re-renders via state.
        // We'll trigger the authenticated callback after a tick.
        Promise.resolve().then(() => callback(null))
        return vi.fn()
      })

      // Click sign-in button
      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      // Now simulate onAuthStateChanged firing with the authenticated user
      // (this is what Firebase does after signInWithPopup succeeds)
      const authCalls = (onAuthStateChanged as Mock).mock.calls
      const authCallback = authCalls[authCalls.length - 1]?.[1] as
        | ((u: unknown) => void)
        | undefined

      if (authCallback) {
        ;(getIdTokenResult as Mock).mockResolvedValue({
          claims: { role: 'nurse' },
          token: 'mock-token',
          expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        authCallback(fakeUser)
      }

      // LoginPage should redirect to /dashboard (the redirect param) and
      // DashboardPage should render
      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      // Login page must no longer be visible
      expect(
        screen.queryByRole('button', { name: /sign in with google/i })
      ).not.toBeInTheDocument()
    })

    it('signInWithPopup is called with GoogleAuthProvider when sign-in button is clicked', async () => {
      const user = userEvent.setup()

      simulateAuthState(null)
      ;(signInWithPopup as Mock).mockResolvedValue({ user: fakeUser })

      renderApp('/dashboard')

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /sign in with google/i })
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      expect(signInWithPopup).toHaveBeenCalledTimes(1)
      // Called with the auth instance and a GoogleAuthProvider instance
      expect(signInWithPopup).toHaveBeenCalledWith(
        expect.anything(), // auth
        expect.any(Object) // GoogleAuthProvider instance (mocked as plain object)
      )
    })
  })

  // ── Scenario B ──────────────────────────────────────────────────────────────

  describe('Scenario B: sign-in with no role claim → signed out → error shown', () => {
    it('signs out user with no role claim and shows "not authorized" error on login page', async () => {
      // Auth resolves with a user that has no role claim
      simulateAuthState(fakeUser, {}) // empty claims → no role

      renderApp('/login')

      // AuthContext should sign out the user and set authError
      await waitFor(() => {
        expect(firebaseSignOut).toHaveBeenCalled()
      })

      // The authError propagates to LoginPage via useAuth().authError
      await waitFor(() => {
        const alert = screen.queryByRole('alert')
        expect(alert).toBeInTheDocument()
        expect(alert?.textContent).toContain('not authorized')
      })

      // User must NOT be redirected to dashboard
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    })

    it('signs out user with invalid role claim and shows error', async () => {
      // Auth resolves with a user that has an unrecognised role
      simulateAuthState(fakeUser, { role: 'superadmin' })

      renderApp('/login')

      await waitFor(() => {
        expect(firebaseSignOut).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.queryByRole('alert')).toBeInTheDocument()
      })

      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    })

    it('does not sign out user with valid "physician" role claim', async () => {
      simulateAuthState(fakeUser, { role: 'physician' })

      renderApp('/login')

      // Auth resolves → LoginPage redirects authenticated user to /dashboard
      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      expect(firebaseSignOut).not.toHaveBeenCalled()
    })

    it('does not sign out user with valid "admin" role claim', async () => {
      simulateAuthState(fakeUser, { role: 'admin' })

      renderApp('/login')

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      expect(firebaseSignOut).not.toHaveBeenCalled()
    })
  })

  // ── Already-authenticated user ───────────────────────────────────────────────

  describe('Already-authenticated user', () => {
    it('authenticated user navigating directly to /dashboard sees protected content', async () => {
      simulateAuthState(fakeUser, { role: 'nurse' })

      renderApp('/dashboard')

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      expect(
        screen.queryByRole('button', { name: /sign in with google/i })
      ).not.toBeInTheDocument()
    })

    it('authenticated user visiting /login is redirected to /dashboard', async () => {
      simulateAuthState(fakeUser, { role: 'nurse' })

      renderApp('/login')

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      expect(
        screen.queryByRole('button', { name: /sign in with google/i })
      ).not.toBeInTheDocument()
    })

    it('authenticated user visiting /login?redirect=/dashboard is redirected to /dashboard', async () => {
      simulateAuthState(fakeUser, { role: 'admin' })

      renderApp('/login?redirect=%2Fdashboard')

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })
    })
  })
})
