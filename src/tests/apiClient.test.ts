/**
 * Tests for apiClient and queryKeys
 *
 * Feature: readmission-prevention-dashboard
 * Property 17: Token Refresh Proactive Strategy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getIdTokenResult, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase/auth', () => ({
  getIdTokenResult: vi.fn(),
  getIdToken: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: null, // overridden per test
    signOut: vi.fn(),
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockGetIdTokenResult = getIdTokenResult as ReturnType<typeof vi.fn>
const mockGetIdToken = getIdToken as ReturnType<typeof vi.fn>
const mockAuth = auth as unknown as { currentUser: unknown; signOut: ReturnType<typeof vi.fn> }

function makeUser() {
  return { uid: 'user-1' }
}

function makeTokenResult(expiresInMs: number, token = 'test-token') {
  const expirationTime = new Date(Date.now() + expiresInMs).toISOString()
  return { token, expirationTime }
}

function mockFetchOk(data: unknown = { ok: true }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

function mockFetch401ThenOk(data: unknown = { ok: true }) {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    })
}

function mockFetch401Always() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({}),
  })
}

// ─── apiClient tests ──────────────────────────────────────────────────────────

describe('apiClient', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
    // Default: user is logged in
    mockAuth.currentUser = makeUser()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // Test 1 — Token attached to every outbound request
  it('attaches Authorization: Bearer <token> header to every request', async () => {
    mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'my-token'))
    globalThis.fetch = mockFetchOk()

    await apiClient('/api/test')

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token')
  })

  // Test 2 — Proactive refresh called when token expires < 5 min
  it('calls getIdToken(user, true) when token expires in less than 5 minutes', async () => {
    // Token expires in 3 minutes — below the 5-minute threshold
    mockGetIdTokenResult.mockResolvedValue(makeTokenResult(3 * 60 * 1000, 'old-token'))
    mockGetIdToken.mockResolvedValue('refreshed-token')
    globalThis.fetch = mockFetchOk()

    await apiClient('/api/test')

    expect(mockGetIdToken).toHaveBeenCalledWith(makeUser(), true)
  })

  // Test 3 — Proactive refresh NOT called when token has > 5 min remaining
  it('does NOT call getIdToken(user, true) when token has more than 5 minutes remaining', async () => {
    // Token expires in 10 minutes — above the threshold
    mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'valid-token'))
    globalThis.fetch = mockFetchOk()

    await apiClient('/api/test')

    expect(mockGetIdToken).not.toHaveBeenCalled()
  })

  // Test 4 — 401 triggers reactive refresh and retry
  it('refreshes token reactively on 401 and retries the request', async () => {
    mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'initial-token'))
    mockGetIdToken.mockResolvedValue('refreshed-token')
    globalThis.fetch = mockFetch401ThenOk({ result: 'success' })

    const result = await apiClient<{ result: string }>('/api/test')

    // getIdToken(user, true) called once for reactive refresh
    expect(mockGetIdToken).toHaveBeenCalledOnce()
    expect(mockGetIdToken).toHaveBeenCalledWith(makeUser(), true)

    // Retry used the refreshed token
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      RequestInit,
    ][]
    expect((calls[1][1].headers as Record<string, string>)['Authorization']).toBe(
      'Bearer refreshed-token',
    )

    // Final response data returned correctly
    expect(result).toEqual({ result: 'success' })
  })

  // Test 5 — Second 401 triggers sign-out
  it('calls auth.signOut() and throws when both requests return 401', async () => {
    mockGetIdTokenResult.mockResolvedValue(makeTokenResult(10 * 60 * 1000, 'initial-token'))
    mockGetIdToken.mockResolvedValue('refreshed-token')
    globalThis.fetch = mockFetch401Always()

    await expect(apiClient('/api/test')).rejects.toThrow('Session expired')

    expect(mockAuth.signOut).toHaveBeenCalledOnce()
  })
})

// ─── queryKeys tests ──────────────────────────────────────────────────────────

describe('queryKeys', () => {
  it('dashboard() returns ["dashboard", "stats"]', () => {
    expect(queryKeys.dashboard()).toEqual(['dashboard', 'stats'])
  })

  it('discharges({ page: 1 }) returns ["discharges", { page: 1 }]', () => {
    expect(queryKeys.discharges({ page: 1 })).toEqual(['discharges', { page: 1 }])
  })

  it('discharges() with no params returns ["discharges", {}]', () => {
    expect(queryKeys.discharges()).toEqual(['discharges', {}])
  })

  it('calls("abc") returns ["calls", "abc", "transcript"]', () => {
    expect(queryKeys.calls('abc')).toEqual(['calls', 'abc', 'transcript'])
  })

  it('escalations() returns ["escalations"]', () => {
    expect(queryKeys.escalations()).toEqual(['escalations'])
  })

  it('patients({ search: "john" }) returns ["patients", { search: "john" }]', () => {
    expect(queryKeys.patients({ search: 'john' })).toEqual(['patients', { search: 'john' }])
  })

  it('patients() with no params returns ["patients", {}]', () => {
    expect(queryKeys.patients()).toEqual(['patients', {}])
  })
})
