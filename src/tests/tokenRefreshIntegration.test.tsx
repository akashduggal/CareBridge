/**
 * Integration test: Token refresh flow (Task 20.4)
 *
 * Feature: readmission-prevention-dashboard
 * Property 17: Token Refresh Proactive Strategy
 * Property 18: Token Refresh Concurrent Request Deduplication
 *
 * Verifies the end-to-end flow through the real apiClient + Firebase SDK boundary:
 *
 *   Scenario 1 — Proactive refresh (token expiring in 3 min):
 *     token expiring in 3 min → apiClient called → getIdToken(true) called
 *     → request sent with refreshed token
 *
 *   Scenario 2 — No proactive refresh (token has > 5 min remaining):
 *     token with 10 min remaining → apiClient called → getIdToken(true) NOT called
 *     → request sent with existing token
 *
 *   Scenario 3 — Boundary conditions for the 5-minute threshold
 *
 *   Scenario 4 — Reactive refresh on 401:
 *     fresh token → 401 response → getIdToken(true) called → retry with new token
 *
 *   Scenario 5 — Double 401 triggers sign-out
 *
 *   Scenario 6 — Proactive refresh + 401 (combined):
 *     expiring token → proactive refresh → 401 → reactive refresh → success
 *
 *   Scenario 7 — Unauthenticated user throws without making a fetch call
 *
 * The tests exercise the real apiClient implementation. Only the Firebase SDK
 * functions (getIdTokenResult, getIdToken, auth.signOut) and globalThis.fetch
 * are mocked at the boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ─── Firebase mocks (must be declared before any module that imports them) ────

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn().mockImplementation(function (this: object) {
    return this
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: null as unknown,
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { getIdToken, getIdTokenResult } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { apiClient } from '@/lib/apiClient'

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockGetIdToken = getIdToken as Mock
const mockGetIdTokenResult = getIdTokenResult as Mock
const mockAuth = auth as unknown as {
  currentUser: Partial<User> | null
  signOut: Mock
}

// ─── Fake user ────────────────────────────────────────────────────────────────

const fakeUser: Partial<User> = { uid: 'user-integration-1', email: 'admin@hospital.org' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a token result object whose token expires `expiresInMs` from now.
 * This is what `getIdTokenResult` returns.
 */
function makeTokenResult(expiresInMs: number, token = 'current-token') {
  return {
    token,
    expirationTime: new Date(Date.now() + expiresInMs).toISOString(),
    claims: { role: 'admin' },
  }
}

/** Resolve fetch with a 200 OK response. */
function mockFetchOk(data: unknown = { ok: true }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

/** First call returns 401, second call returns 200. */
function mockFetch401ThenOk(data: unknown = { ok: true }) {
  return vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) })
}

/** Every call returns 401. */
function mockFetch401Always() {
  return vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Token refresh integration flow (Task 20.4)', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
    // Default: authenticated user present
    mockAuth.currentUser = fakeUser as User
    mockAuth.signOut.mockResolvedValue(undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ── Scenario 1: Proactive refresh — token expiring in 3 minutes ─────────────

  describe('Scenario 1: token expiring in 3 minutes triggers proactive refresh', () => {
    it('calls getIdToken(user, true) and sends refreshed token when token expires in 3 min', async () => {
      // Token expires in 3 minutes — below the 5-minute proactive threshold
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(3 * 60 * 1000, 'expiring-token'))
      mockGetIdToken.mockResolvedValue('refreshed-token-3min')
      globalThis.fetch = mockFetchOk({ data: 'dashboard-stats' })

      const result = await apiClient<{ data: string }>('/api/dashboard/stats')

      // getIdToken(true) MUST have been called (proactive refresh)
      expect(mockGetIdToken).toHaveBeenCalledWith(fakeUser, true)

      // The outbound request MUST carry the refreshed token
      expect(globalThis.fetch).toHaveBeenCalledOnce()
      const [, requestOptions] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((requestOptions.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer refreshed-token-3min',
      )

      // Correct response data returned
      expect(result).toEqual({ data: 'dashboard-stats' })
    })

    it('calls getIdToken(true) when token expires in 1 minute', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(60_000, 'almost-expired-token'))
      mockGetIdToken.mockResolvedValue('refreshed-1min-token')
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/test')

      expect(mockGetIdToken).toHaveBeenCalledWith(fakeUser, true)
      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer refreshed-1min-token',
      )
    })

    it('calls getIdToken(true) when token expires in 4 min 59 sec (just below threshold)', async () => {
      // 4 min 59 sec = 299,000 ms — still below the 5-minute threshold
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(299_000, 'near-threshold-token'))
      mockGetIdToken.mockResolvedValue('refreshed-near-threshold-token')
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/test')

      expect(mockGetIdToken).toHaveBeenCalledWith(fakeUser, true)
      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer refreshed-near-threshold-token',
      )
    })
  })

  // ── Scenario 2: No proactive refresh — token has > 5 min remaining ──────────

  describe('Scenario 2: token with > 5 min remaining skips proactive refresh', () => {
    it('does NOT call getIdToken(true) and sends existing token when token has 10 min remaining', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'fresh-token-10min'))
      globalThis.fetch = mockFetchOk({ data: 'ok' })

      const result = await apiClient<{ data: string }>('/api/discharges')

      // getIdToken(true) must NOT have been called
      expect(mockGetIdToken).not.toHaveBeenCalled()

      // The existing token from getIdTokenResult is used directly
      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer fresh-token-10min',
      )

      expect(result).toEqual({ data: 'ok' })
    })

    it('does NOT call getIdToken(true) when token expires in exactly 5 min (at threshold)', async () => {
      // Exactly 5 minutes = 300,000 ms — at the threshold, NOT below it
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(300_000, 'at-threshold-token'))
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/test')

      expect(mockGetIdToken).not.toHaveBeenCalled()
      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer at-threshold-token',
      )
    })

    it('does NOT call getIdToken(true) when token has 1 hour remaining', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(60 * 60 * 1000, 'long-lived-token'))
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/patients')

      expect(mockGetIdToken).not.toHaveBeenCalled()
      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer long-lived-token',
      )
    })
  })

  // ── Scenario 3: Reactive refresh — 401 response ─────────────────────────────

  describe('Scenario 3: reactive refresh on 401 response', () => {
    it('refreshes token on 401 and retries request with new token', async () => {
      // Token is fresh — no proactive refresh
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'initial-token'))
      mockGetIdToken.mockResolvedValue('reactive-refreshed-token')
      globalThis.fetch = mockFetch401ThenOk({ data: 'retry-success' })

      const result = await apiClient<{ data: string }>('/api/escalations')

      // getIdToken(true) called exactly once for reactive refresh
      expect(mockGetIdToken).toHaveBeenCalledOnce()
      expect(mockGetIdToken).toHaveBeenCalledWith(fakeUser, true)

      // Two fetch calls: original (401) + retry (200)
      const fetchCalls = (globalThis.fetch as Mock).mock.calls as [string, RequestInit][]
      expect(fetchCalls).toHaveLength(2)

      // Original request used the initial token
      expect((fetchCalls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer initial-token',
      )
      // Retry request used the reactively refreshed token
      expect((fetchCalls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer reactive-refreshed-token',
      )

      expect(result).toEqual({ data: 'retry-success' })
    })

    it('retries the same URL on 401', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'token'))
      mockGetIdToken.mockResolvedValue('refreshed-token')
      globalThis.fetch = mockFetch401ThenOk()

      await apiClient('/api/calls/abc/transcript')

      const fetchCalls = (globalThis.fetch as Mock).mock.calls as [string, RequestInit][]
      expect(fetchCalls[0][0]).toBe('/api/calls/abc/transcript')
      expect(fetchCalls[1][0]).toBe('/api/calls/abc/transcript')
    })
  })

  // ── Scenario 4: Double 401 triggers sign-out ─────────────────────────────────

  describe('Scenario 4: double 401 triggers sign-out', () => {
    it('calls auth.signOut() and throws when both original and retry requests return 401', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'initial-token'))
      mockGetIdToken.mockResolvedValue('reactive-refreshed-token')
      globalThis.fetch = mockFetch401Always()

      await expect(apiClient('/api/patients')).rejects.toThrow(/session expired/i)

      // auth.signOut() must have been called
      expect(mockAuth.signOut).toHaveBeenCalledOnce()
    })

    it('makes exactly two fetch calls before signing out on double 401', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'token'))
      mockGetIdToken.mockResolvedValue('refreshed-token')
      globalThis.fetch = mockFetch401Always()

      await expect(apiClient('/api/test')).rejects.toThrow()

      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })
  })

  // ── Scenario 5: Proactive refresh + 401 (combined) ──────────────────────────

  describe('Scenario 5: proactive refresh on expiring token, then 401 reactive refresh', () => {
    it('proactively refreshes expiring token, then reactively refreshes on 401, then succeeds', async () => {
      // Token expires in 2 minutes — triggers proactive refresh
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(2 * 60 * 1000, 'expiring-token'))

      // Proactive refresh returns a token; reactive refresh returns another
      mockGetIdToken
        .mockResolvedValueOnce('proactively-refreshed-token') // proactive
        .mockResolvedValueOnce('reactively-refreshed-token') // reactive

      // First fetch (with proactively refreshed token) returns 401
      // Second fetch (with reactively refreshed token) succeeds
      globalThis.fetch = mockFetch401ThenOk({ data: 'combined-success' })

      const result = await apiClient<{ data: string }>('/api/calls/abc/transcript')

      // getIdToken(true) called twice: once proactively, once reactively
      expect(mockGetIdToken).toHaveBeenCalledTimes(2)

      const fetchCalls = (globalThis.fetch as Mock).mock.calls as [string, RequestInit][]
      expect(fetchCalls).toHaveLength(2)

      // First request used the proactively refreshed token
      expect((fetchCalls[0][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer proactively-refreshed-token',
      )
      // Retry used the reactively refreshed token
      expect((fetchCalls[1][1].headers as Record<string, string>)['Authorization']).toBe(
        'Bearer reactively-refreshed-token',
      )

      expect(result).toEqual({ data: 'combined-success' })
    })
  })

  // ── Scenario 6: Unauthenticated user ─────────────────────────────────────────

  describe('Scenario 6: unauthenticated user', () => {
    it('throws "Not authenticated" when auth.currentUser is null', async () => {
      mockAuth.currentUser = null

      await expect(apiClient('/api/dashboard/stats')).rejects.toThrow(/not authenticated/i)
    })

    it('makes no fetch calls when auth.currentUser is null', async () => {
      mockAuth.currentUser = null
      const mockFetch = mockFetchOk()
      globalThis.fetch = mockFetch

      await expect(apiClient('/api/test')).rejects.toThrow()

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ── Scenario 7: Authorization header format ───────────────────────────────────

  describe('Scenario 7: Authorization header format', () => {
    it('sends Authorization header as "Bearer <token>" (not just the token)', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'abc123'))
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/test')

      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      const authHeader = (opts.headers as Record<string, string>)['Authorization']
      expect(authHeader).toMatch(/^Bearer /)
      expect(authHeader).toBe('Bearer abc123')
    })

    it('includes Content-Type: application/json header', async () => {
      mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'token'))
      globalThis.fetch = mockFetchOk()

      await apiClient('/api/test')

      const [, opts] = (globalThis.fetch as Mock).mock.calls[0] as [string, RequestInit]
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    })
  })
})
