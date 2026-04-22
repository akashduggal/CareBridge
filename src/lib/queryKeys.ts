// Query key factory for consistent, hierarchical cache keys
export const queryKeys = {
  // Dashboard stats
  dashboard: () => ['dashboard', 'stats'] as const,

  // Discharges list with optional filter/pagination params
  discharges: (params?: {
    page?: number
    diagnosisGroup?: string[]
    riskTier?: number[]
    callOutcome?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
  }) => ['discharges', params ?? {}] as const,

  // Single call transcript
  calls: (id: string) => ['calls', id, 'transcript'] as const,

  // Escalations list
  escalations: () => ['escalations'] as const,

  // Patients list with optional search/pagination params
  patients: (params?: {
    page?: number
    search?: string
    limit?: number
  }) => ['patients', params ?? {}] as const,
} as const
