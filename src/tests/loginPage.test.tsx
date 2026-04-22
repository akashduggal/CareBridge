/**
 * Tests for LoginPage (tasks 10.6–10.8)
 *
 * 10.6 – Button triggers signInWithPopup with GoogleAuthProvider
 * 10.7 – Error displayed on sign-in failure; no raw Firebase error codes shown
 * 10.8 – Redirect to originally requested URL after successful sign-in
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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

vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

import { useAuth } from '@/contexts/AuthContext'
import { LoginPage } from '@/pages/LoginPage'
import type { Mock } from 'vitest'
import type { AuthContextValue } from '@/types'
import type { User } from 'firebase/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeUser = { uid: 'u1', email: 'nurse@example.com' } as unknown as User

function mockAuth(overrides: Partial<AuthContextValue> = {}) {
  ;(useAuth as Mock).mockReturnValue({
    user: null,
    role: null,
    loading: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
    ...overrides,
  } satisfies AuthContextValue)
}

function DashboardStub() {
  return <div>Dashboard</div>
}

function renderLoginPage(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardStub />} />
        <Route path="/discharges" element={<div>Discharges</div>} />
      </Routes>
    </MemoryRouter>
  )
}

// ─── 10.6: Button triggers signInWithGoogle ───────────────────────────────────

describe('10.6 – Sign in button calls signInWithGoogle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls signInWithGoogle when button is clicked', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('shows loading state while signing in', async () => {
    // signInWithGoogle never resolves during this test
    const signInWithGoogle = vi.fn().mockReturnValue(new Promise(() => {}))
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    expect(screen.getByText('Signing in…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDisabled()
  })
})

// ─── 10.7: Error displayed on failure; no raw Firebase codes ─────────────────

describe('10.7 – Error displayed on sign-in failure; no raw Firebase codes shown', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows user-friendly message when popup is closed', async () => {
    const err = Object.assign(new Error('popup closed'), {
      code: 'auth/popup-closed-by-user',
    })
    const signInWithGoogle = vi.fn().mockRejectedValue(err)
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('cancelled')
    // Must NOT show raw Firebase error code
    expect(alert.textContent).not.toContain('auth/')
  })

  it('shows user-friendly message when popup is blocked', async () => {
    const err = Object.assign(new Error('popup blocked'), {
      code: 'auth/popup-blocked',
    })
    const signInWithGoogle = vi.fn().mockRejectedValue(err)
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toContain('blocked')
    expect(screen.getByRole('alert').textContent).not.toContain('auth/')
  })

  it('shows user-friendly message for network errors', async () => {
    const err = Object.assign(new Error('network error'), {
      code: 'auth/network-request-failed',
    })
    const signInWithGoogle = vi.fn().mockRejectedValue(err)
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toContain('network')
    expect(screen.getByRole('alert').textContent).not.toContain('auth/')
  })

  it('shows generic message for unknown errors', async () => {
    const err = Object.assign(new Error('unknown'), { code: 'auth/unknown-error' })
    const signInWithGoogle = vi.fn().mockRejectedValue(err)
    mockAuth({ signInWithGoogle })

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in with google/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).not.toContain('auth/')
  })

  it('surfaces authError from AuthContext (unauthorized account)', async () => {
    mockAuth({ authError: 'Your account is not authorized' })

    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('alert').textContent).toContain('not authorized')
  })
})

// ─── 10.8: Redirect to originally requested URL after sign-in ─────────────────

describe('10.8 – Redirect to originally requested URL after sign-in', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects to /dashboard by default after sign-in', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderLoginPage('/login')

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  it('redirects to the redirect param URL after sign-in', async () => {
    mockAuth({ user: fakeUser, loading: false })

    renderLoginPage('/login?redirect=%2Fdischarges')

    await waitFor(() => {
      expect(screen.getByText('Discharges')).toBeInTheDocument()
    })
  })

  it('does not redirect when user is null', () => {
    mockAuth({ user: null, loading: false })

    renderLoginPage()

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })
})
