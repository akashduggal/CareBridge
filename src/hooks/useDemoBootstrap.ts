/**
 * useDemoBootstrap — activates demo mode on app mount when VITE_DEMO_MODE=true.
 *
 * Seeds the TanStack Query cache with the default scenario's mock data and
 * installs the fetch interceptor so all API calls are served from mock data.
 * This replaces the old DemoPanel floating menu — demo mode is now always-on
 * when the feature flag is set, with no UI required.
 *
 * Must be called inside a component that has access to QueryClient and AuthContext
 * (i.e. inside QueryClientProvider + AuthProvider).
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useDemoMode } from '@/hooks/useDemoMode'
import { DEMO_SCENARIOS } from '@/mocks/demoScenarios'
import { mockEventEmitter, buildScenarioEvents } from '@/mocks/mockEventEmitter'
import { activateDemoInterceptor, deactivateDemoInterceptor } from '@/mocks/demoApiInterceptor'
import { queryKeys } from '@/lib/queryKeys'
import type { ApiResponse, Call } from '@/types'

/** The scenario used when demo mode is active. */
const DEMO_SCENARIO = 'emergency-chest-pain' as const

export function useDemoBootstrap(): void {
  const isDemoMode = useDemoMode()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isDemoMode || !user) return

    const data = DEMO_SCENARIOS[DEMO_SCENARIO]

    // Install fetch interceptor — all REST calls return mock data
    activateDemoInterceptor(DEMO_SCENARIO)

    // Seed TanStack Query cache so all pages reflect the scenario immediately
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
      queryClient.setQueryData(queryKeys.calls(data.call.id), data.call.transcript)
    }

    // Fire scenario events through the mock emitter so WebSocketProvider
    // processes them and keeps the cache in sync
    const events = buildScenarioEvents(DEMO_SCENARIO)
    for (const event of events) {
      mockEventEmitter.emit(event)
    }

    return () => {
      deactivateDemoInterceptor()
    }
  }, [isDemoMode, user, queryClient])
}
