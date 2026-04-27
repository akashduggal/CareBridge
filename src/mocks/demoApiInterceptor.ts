/**
 * Demo Mode REST API Interceptor (Task 17.7)
 *
 * When Demo Mode is active (`?demo=true`), this module patches `globalThis.fetch`
 * so that ALL outbound REST API requests are intercepted and resolved against the
 * active scenario's mock data — no real network requests reach the backend.
 *
 * Requirements 8.12 (Demo Mode network isolation)
 * Correctness Property: WHEN Demo_Mode is active, no outbound network request
 * SHALL reach the real backend API or WebSocket endpoint.
 *
 * Usage:
 *   activateDemoInterceptor(scenario)  — install the fetch patch for a scenario
 *   deactivateDemoInterceptor()        — restore the original fetch
 */

import type { DemoScenario } from '@/components/DemoPanel'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
import type { ScenarioData } from '@/mocks/demoScenarios'
import type { Discharge } from '@/types'

// ─── Original fetch reference ─────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch | null = null
let isInterceptorActive = false

// ─── Discharge list filtering / sorting / pagination ─────────────────────────

function resolveDischarges(urlObj: URL, scenarioData: ScenarioData): unknown {
  const params = urlObj.searchParams
  let items: Discharge[] = [...scenarioData.discharges.data]

  // ── Filter: diagnosisGroup (multi-value) ──────────────────────────────────
  const diagnosisGroups = params.getAll('diagnosisGroup')
  if (diagnosisGroups.length > 0) {
    items = items.filter((d) => diagnosisGroups.includes(d.diagnosisGroup))
  }

  // ── Filter: riskTier (multi-value) ────────────────────────────────────────
  const riskTiers = params.getAll('riskTier').map(Number)
  if (riskTiers.length > 0) {
    items = items.filter((d) => d.riskTier !== undefined && riskTiers.includes(d.riskTier))
  }

  // ── Filter: callOutcome (multi-value, matches callOutcome field) ─────────────
  const callOutcomes = params.getAll('callOutcome')
  if (callOutcomes.length > 0) {
    items = items.filter((d) => d.callOutcome !== undefined && callOutcomes.includes(d.callOutcome))
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortBy = params.get('sortBy') ?? 'dischargeDateTime'
  const sortDir = params.get('sortDir') ?? 'desc'
  const dir = sortDir === 'asc' ? 1 : -1

  items.sort((a, b) => {
    switch (sortBy) {
      case 'patientName':
        return dir * a.patientName.localeCompare(b.patientName)
      case 'riskTier':
        return dir * ((a.riskTier ?? 0) - (b.riskTier ?? 0))
      case 'callStatus':
        return dir * a.callStatus.localeCompare(b.callStatus)
      case 'dischargeDateTime':
      default:
        return dir * (new Date(a.dischargeDateTime).getTime() - new Date(b.dischargeDateTime).getTime())
    }
  })

  // ── Pagination ────────────────────────────────────────────────────────────
  const total = items.length
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const limit = Math.max(1, parseInt(params.get('limit') ?? '25', 10))
  const start = (page - 1) * limit
  items = items.slice(start, start + limit)

  return { data: items, meta: { page, limit, total } }
}

// ─── URL pattern matching ─────────────────────────────────────────────────────

/**
 * Resolve a URL path against the active scenario's mock data.
 * Returns the mock response body (as a plain object) or null if the URL
 * does not match any known endpoint.
 */
function resolveMockResponse(url: string, method: string, scenarioData: ScenarioData): unknown {
  // Normalize: strip query string and leading slash for matching
  const urlObj = new URL(url, 'http://localhost')
  const pathname = urlObj.pathname.replace(/^\/+/, '')

  // GET /dashboard/stats
  if (method === 'GET' && /^(api\/)?dashboard\/stats$/.test(pathname)) {
    return scenarioData.stats
  }

  // GET /discharges (list) — applies filters, sort, and pagination from query params
  if (method === 'GET' && /^(api\/)?discharges$/.test(pathname)) {
    return resolveDischarges(urlObj, scenarioData)
  }

  // GET /escalations
  if (method === 'GET' && /^(api\/)?escalations$/.test(pathname)) {
    return scenarioData.escalations
  }

  // GET /patients (list)
  if (method === 'GET' && /^(api\/)?patients$/.test(pathname)) {
    return scenarioData.patients
  }

  // GET /calls/:id/transcript  (e.g. /calls/demo-call-chf-001/transcript)
  const callTranscriptMatch = pathname.match(/^(?:api\/)?calls\/([^/]+)\/transcript$/)
  if (method === 'GET' && callTranscriptMatch) {
    const callId = callTranscriptMatch[1]
    if (callId === scenarioData.call.id && scenarioData.call.transcript) {
      return scenarioData.call.transcript
    }
    // Return 404-like response for unknown call IDs
    return null
  }

  // GET /patients/:id  (single patient detail)
  const patientDetailMatch = pathname.match(/^(?:api\/)?patients\/([^/]+)$/)
  if (method === 'GET' && patientDetailMatch) {
    const patientId = patientDetailMatch[1]
    if (patientId === scenarioData.patient.id) {
      return scenarioData.patient
    }
    return null
  }

  // GET /patients/:id/discharges  (patient discharge history)
  const patientDischargesMatch = pathname.match(/^(?:api\/)?patients\/([^/]+)\/discharges$/)
  if (method === 'GET' && patientDischargesMatch) {
    const patientId = patientDischargesMatch[1]
    if (patientId === scenarioData.patient.id) {
      return scenarioData.patientDischarges
    }
    return null
  }

  // GET /discharges/:id/calls  (calls for a discharge, shown in drawer)
  const dischargeCallsMatch = pathname.match(/^(?:api\/)?discharges\/([^/]+)\/calls$/)
  if (method === 'GET' && dischargeCallsMatch) {
    const dischargeId = dischargeCallsMatch[1]
    // First check the callsByDischargeId map (covers all queue discharges)
    if (scenarioData.callsByDischargeId?.[dischargeId]) {
      const calls = scenarioData.callsByDischargeId[dischargeId]
      return { data: calls, meta: { page: 1, limit: 25, total: calls.length } }
    }
    // Fall back to primary discharge calls
    if (dischargeId === scenarioData.discharge.id) {
      return scenarioData.dischargeCalls
    }
    return { data: [], meta: { page: 1, limit: 25, total: 0 } }
  }

  // POST /patients  (create patient — return the scenario patient)
  if (method === 'POST' && /^(api\/)?patients$/.test(pathname)) {
    return scenarioData.patient
  }

  // POST /discharges  (create discharge — return the scenario discharge)
  if (method === 'POST' && /^(api\/)?discharges$/.test(pathname)) {
    return scenarioData.discharge
  }

  // Unknown endpoint — return null (will produce a 404 mock response)
  return null
}

/**
 * Build a mock `Response` object from a resolved mock body.
 * Returns a 200 response with JSON body, or a 404 response if body is null.
 */
function buildMockResponse(body: unknown): Response {
  if (body === null) {
    return new Response(JSON.stringify({ error: { message: 'Not found', code: 'NOT_FOUND' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Interceptor lifecycle ────────────────────────────────────────────────────

/**
 * Install the demo fetch interceptor for the given scenario.
 * All subsequent `fetch()` calls will be resolved against the scenario's mock data.
 * Safe to call multiple times — calling again with a different scenario updates
 * the active scenario without double-patching.
 */
export function activateDemoInterceptor(scenario: DemoScenario): void {
  const scenarioData = DEMO_SCENARIOS[scenario]

  // Save the original fetch only on the first activation
  if (!isInterceptorActive) {
    originalFetch = globalThis.fetch
    isInterceptorActive = true
  }

  // Replace (or re-replace) globalThis.fetch with the interceptor
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()

    const mockBody = resolveMockResponse(url, method, scenarioData)
    return buildMockResponse(mockBody)
  }
}

/**
 * Remove the demo fetch interceptor and restore the original `fetch`.
 * Safe to call even if the interceptor is not currently active.
 */
export function deactivateDemoInterceptor(): void {
  if (isInterceptorActive && originalFetch !== null) {
    globalThis.fetch = originalFetch
    originalFetch = null
    isInterceptorActive = false
  }
}

/**
 * Returns true if the demo fetch interceptor is currently installed.
 * Useful for tests and assertions.
 */
export function isDemoInterceptorActive(): boolean {
  return isInterceptorActive
}
