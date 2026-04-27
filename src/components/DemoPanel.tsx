/**
 * DemoPanel — floating panel for activating demo scenarios.
 *
 * Rendered only when:
 *   1. The URL contains `?demo=true`
 *   2. The user is authenticated (user !== null)
 *
 * On mount (when both conditions are met), automatically activates the
 * "Happy Path CHF" scenario so the app is fully functional without any
 * backend — no scenario button click required.
 *
 * Requirements 8.1, 8.3, 8.4, 8.9, 8.11
 */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
import { mockEventEmitter, buildScenarioEvents } from '@/mocks/mockEventEmitter'
import { activateDemoInterceptor, deactivateDemoInterceptor } from '@/mocks/demoApiInterceptor'
import { queryKeys } from '@/lib/queryKeys'
import type { ApiResponse, Call } from '@/types'

export type DemoScenario = 'happy-path-chf' | 'medium-risk-copd' | 'emergency-chest-pain'

const DEFAULT_SCENARIO: DemoScenario = 'happy-path-chf'

interface ScenarioConfig {
  id: DemoScenario
  label: string
  description: string
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'happy-path-chf',
    label: 'Happy Path CHF',
    description: 'Tier 1 · Risk Score 2 · Completed call',
  },
  {
    id: 'medium-risk-copd',
    label: 'Medium Risk COPD',
    description: 'Tier 2 · Risk Score 5 · Completed call',
  },
  {
    id: 'emergency-chest-pain',
    label: 'Emergency Chest Pain',
    description: 'Tier 3 · Risk Score 9 · Active escalation',
  },
]

interface DemoPanelProps {
  onScenarioActivate?: (scenario: DemoScenario) => void
}

export function DemoPanel({ onScenarioActivate }: DemoPanelProps) {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const isDemoParam = searchParams.get('demo') === 'true'

  // Seed the TanStack Query cache and activate the fetch interceptor for a scenario.
  // Extracted as useCallback so it can be called both from the auto-activate effect
  // and from manual button clicks.
  const activateScenario = useCallback(
    (scenario: DemoScenario) => {
      setActiveScenario(scenario)
      onScenarioActivate?.(scenario)

      // Intercept all REST API requests — no real network requests reach the backend.
      activateDemoInterceptor(scenario)

      const data = DEMO_SCENARIOS[scenario]

      // Seed TanStack Query cache so all pages reflect the scenario state immediately.
      queryClient.setQueryData(queryKeys.dashboard(), data.stats)
      queryClient.setQueryData(queryKeys.discharges(), data.discharges)
      queryClient.setQueryData(queryKeys.escalations(), data.escalations)
      queryClient.setQueryData(queryKeys.patients(), data.patients)
      queryClient.setQueryData(queryKeys.patient(data.patient.id), data.patient)

      const callsResponse: ApiResponse<Call[]> = {
        data: [data.call],
        meta: { page: 1, limit: 25, total: 1 },
      }
      queryClient.setQueryData(queryKeys.dischargeCalls(data.discharge.id), callsResponse)

      if (data.call.transcript) {
        queryClient.setQueryData(queryKeys.calls(data.call.id), data.call)
      }

      // Fire scenario events through the mock emitter so the WebSocketProvider
      // pipeline processes them, keeping the cache in sync.
      const events = buildScenarioEvents(scenario)
      for (const event of events) {
        mockEventEmitter.emit(event)
      }
    },
    [onScenarioActivate, queryClient]
  )

  // Auto-activate the default scenario on mount so the app works immediately
  // without requiring the user to click a scenario button.
  useEffect(() => {
    if (isDemoParam && user) {
      activateScenario(DEFAULT_SCENARIO)
    }
    // Only run on mount (or when auth resolves) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoParam, user])

  // Deactivate the fetch interceptor when the panel unmounts.
  useEffect(() => {
    return () => {
      deactivateDemoInterceptor()
    }
  }, [])

  // Requirement 8.3: not rendered in DOM when ?demo=true is absent
  if (!isDemoParam) return null

  // Requirement 8.1: only visible when authenticated
  if (!user) return null

  return (
    <div
      data-testid="demo-panel"
      className="fixed bottom-4 right-4 z-50 w-64 rounded-xl border border-purple-200 bg-white shadow-xl"
      role="region"
      aria-label="Demo Mode panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-xl bg-purple-600 px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-white">
          Demo Mode
        </span>
        <button
          type="button"
          aria-label={collapsed ? 'Expand demo panel' : 'Collapse demo panel'}
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-0.5 text-purple-200 hover:bg-purple-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            )}
          </svg>
        </button>
      </div>

      {/* Scenario buttons */}
      {!collapsed && (
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs font-medium text-gray-500">Select a scenario:</p>
          {SCENARIOS.map((scenario) => {
            const isActive = activeScenario === scenario.id
            return (
              <button
                key={scenario.id}
                type="button"
                data-testid={`demo-scenario-${scenario.id}`}
                aria-pressed={isActive}
                onClick={() => activateScenario(scenario.id)}
                className={[
                  'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1',
                  isActive
                    ? 'border-purple-500 bg-purple-50 font-semibold text-purple-800 ring-2 ring-purple-400'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50',
                ].join(' ')}
              >
                <span className="block font-medium">{scenario.label}</span>
                <span className="block text-xs text-gray-500">{scenario.description}</span>
              </button>
            )
          })}

          {activeScenario && (
            <p className="mt-1 text-center text-xs text-purple-600">
              ✓ Scenario active
            </p>
          )}
        </div>
      )}
    </div>
  )
}
