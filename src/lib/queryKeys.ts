// Query key factory for consistent, hierarchical cache keys
export const queryKeys = {
  // Dashboard stats
  dashboard: () => ['dashboard', 'stats'] as const,

  // Discharges list with optional filter/pagination params
  discharges: (params?: {
    page?: number
    limit?: number
    diagnosisGroup?: string[]
    riskTier?: number[]
    callOutcome?: string[]
    sortBy?: string
    sortDir?: 'asc' | 'desc'
  }) => ['discharges', params ?? {}] as const,

  // Single call transcript
  calls: (id: string) => ['calls', id, 'transcript'] as const,

  // Calls for a specific discharge
  dischargeCalls: (dischargeId: string) => ['discharges', dischargeId, 'calls'] as const,

  // Escalations list
  escalations: () => ['escalations'] as const,

  // Patients list with optional search/pagination params
  patients: (params?: {
    page?: number
    search?: string
    limit?: number
  }) => ['patients', params ?? {}] as const,

  // Single patient detail
  patient: (id: string) => ['patients', id] as const,

  // Discharge history for a specific patient
  patientDischarges: (patientId: string) => ['patients', patientId, 'discharges'] as const,

  // Current user profile / preferences
  userProfile: () => ['users', 'me', 'preferences'] as const,
} as const
