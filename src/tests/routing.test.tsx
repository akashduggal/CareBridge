/**
 * Routing and ProtectedRoute component tests (tasks 5.6–5.8)
 *
 * 5.6 – Unauthenticated user navigating to /dashboard redirects to /login
 * 5.7 – Nurse/Physician accessing /discharges/new sees PermissionDenied
 * 5.8 – After sign-in, user is redirected to originally requested URL from redirect param
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'

// ─── Firebase mocks ───────────────────────────────────────────────────────────

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
  auth: { currentUser: null, signOut: vi.fn() },
}))

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

import { useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { PermissionDenied } from '@/pages/PermissionDenied'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DischargeFormPage } from '@/pages/DischargeFormPage'
import type { Mock } from 'vitest'
import type { AuthContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthState = {
  user: User | null
  role: AuthContextValue['role']
  loading: boolean
}

function mockAuth(state: AuthState) {
  ;(useAuth as Mock).mockReturnValue({
    user: state.user,
    role: state.role,
    loading: state.loading,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
  } satisfies AuthContextValue)
}

/** Fake user object — only needs to be truthy for ProtectedRoute checks */
const fakeUser = { uid: 'u1', email: 'test@example.com' } as unknown as User

/**
 * Render the full route tree using MemoryRouter so we can control the initial
 * URL without touching the real browser history.
 */
function renderRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — all roles */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Protected — Admin only */}
        <Route
          path="/discharges/new"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DischargeFormPage />
            </ProtectedRoute>
          }
        />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </MemoryRouter>
  )
}

// ─── 5.6: Unauthenticated redirect to /login ─────────────────────────────────

describe('5.6 – Unauthenticated user navigating to /dashboard redirects to /login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when user is null and auth is resolved', async () => {
    mockAuth({ user: null, role: null, loading: false })

    renderRoutes('/dashboard')

    // After redirect, the LoginPage stub should be rendered
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })

    // Dashboard content should NOT be visible
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('shows loading spinner while auth is still resolving', () => {
    mockAuth({ user: null, role: null, loading: true })

    renderRoutes('/dashboard')

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Login')).not.toBeInTheDocument()
  })

  it('renders dashboard content once auth resolves with a valid user', async () => {
    mockAuth({ user: fakeUser, role: 'nurse', loading: false })

    renderRoutes('/dashboard')

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    expect(screen.queryByText('Login')).not.toBeInTheDocument()
  })
})

// ─── 5.7: Nurse/Physician accessing /discharges/new sees PermissionDenied ────

describe('5.7 – Nurse/Physician accessing /discharges/new sees PermissionDenied', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows PermissionDenied for nurse role', async () => {
    mockAuth({ user: fakeUser, role: 'nurse', loading: false })

    renderRoutes('/discharges/new')

    await waitFor(() => {
      expect(
        screen.getByText("You don't have permission to access this page.")
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('New Discharge')).not.toBeInTheDocument()
  })

  it('shows PermissionDenied for physician role', async () => {
    mockAuth({ user: fakeUser, role: 'physician', loading: false })

    renderRoutes('/discharges/new')

    await waitFor(() => {
      expect(
        screen.getByText("You don't have permission to access this page.")
      ).toBeInTheDocument()
    })

    expect(screen.queryByText('New Discharge')).not.toBeInTheDocument()
  })

  it('renders DischargeFormPage for admin role', async () => {
    mockAuth({ user: fakeUser, role: 'admin', loading: false })

    renderRoutes('/discharges/new')

    await waitFor(() => {
      expect(screen.getByText('New Discharge')).toBeInTheDocument()
    })

    expect(
      screen.queryByText("You don't have permission to access this page.")
    ).not.toBeInTheDocument()
  })

  it('PermissionDenied page contains a link to Dashboard', async () => {
    mockAuth({ user: fakeUser, role: 'nurse', loading: false })

    renderRoutes('/discharges/new')

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /go to dashboard/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/dashboard')
    })
  })
})

// ─── 5.8: Redirect to originally requested URL after sign-in ─────────────────

describe('5.8 – After sign-in, user is redirected to originally requested URL from redirect param', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unauthenticated user visiting /dashboard is redirected to /login with redirect param', async () => {
    mockAuth({ user: null, role: null, loading: false })

    // We need to capture the rendered URL. We'll check that LoginPage is shown
    // (which means the redirect happened) and verify the redirect param is encoded.
    // Use a custom route tree that exposes the current location.
    let capturedSearch = ''

    function LoginPageWithCapture() {
      // Capture the search params from the current location
      const [searchParams] = useSearchParams()
      capturedSearch = searchParams.get('redirect') ?? ''
      return <div>Login</div>
    }

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<LoginPageWithCapture />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })

    expect(capturedSearch).toBe('/dashboard')
  })

  it('authenticated user visiting /login with redirect param is redirected to that URL', async () => {
    // When user is already authenticated and visits /login?redirect=/dashboard,
    // LoginPage should redirect them to /dashboard
    mockAuth({ user: fakeUser, role: 'nurse', loading: false })

    render(
      <MemoryRouter initialEntries={['/login?redirect=%2Fdashboard']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    // LoginPage should redirect to /dashboard since user is authenticated
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    expect(screen.queryByText('Login')).not.toBeInTheDocument()
  })

  it('authenticated user visiting /login without redirect param goes to /dashboard', async () => {
    mockAuth({ user: fakeUser, role: 'admin', loading: false })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })
})

// ─── PermissionDenied standalone ─────────────────────────────────────────────

describe('PermissionDenied page', () => {
  it('renders the permission denied message and dashboard link', () => {
    render(
      <MemoryRouter>
        <PermissionDenied />
      </MemoryRouter>
    )

    expect(screen.getByText('Permission Denied')).toBeInTheDocument()
    expect(
      screen.getByText("You don't have permission to access this page.")
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard'
    )
  })
})
