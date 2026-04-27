import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import { RoleBadge } from '@/components/RoleBadge'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBanner } from '@/components/ErrorBanner'
import { apiClient } from '@/lib/apiClient'
import { queryKeys } from '@/lib/queryKeys'
import type { UserPreferences } from '@/types'

export function ProfilePage() {
  const { user, role, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClientInstance = useQueryClient()

  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  // Tracks the last announced toggle state for the aria-live region
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null)

  // ── Preferences query (task 6.1) ──────────────────────────────────────────
  const {
    data: prefs,
    isLoading: prefsLoading,
    isError: prefsIsError,
    refetch: prefsRefetch,
  } = useQuery<UserPreferences>({
    queryKey: queryKeys.userProfile(),
    queryFn: () => apiClient<UserPreferences>('/api/users/me/preferences'),
    enabled: Boolean(user),
  })

  // ── Preferences mutation (task 6.2) ───────────────────────────────────────
  const prefsMutation = useMutation({
    mutationFn: (patch: Partial<UserPreferences>) =>
      apiClient<UserPreferences>('/api/users/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      // Cancel any in-flight queries to avoid overwriting the optimistic update
      await queryClientInstance.cancelQueries({ queryKey: queryKeys.userProfile() })
      // Snapshot the previous value for rollback
      const previous = queryClientInstance.getQueryData<UserPreferences>(
        queryKeys.userProfile()
      )
      // Apply optimistic update
      queryClientInstance.setQueryData<UserPreferences>(
        queryKeys.userProfile(),
        (old) => (old ? { ...old, ...patch } : old)
      )
      return { previous }
    },
    onError: (_err, _patch, context) => {
      // Rollback to the snapshot
      if (context?.previous !== undefined) {
        queryClientInstance.setQueryData(queryKeys.userProfile(), context.previous)
      }
      setPrefsError('Failed to save preference. Please try again.')
    },
    onSettled: () => {
      void queryClientInstance.invalidateQueries({ queryKey: queryKeys.userProfile() })
    },
  })

  async function handleSignOut() {
    setSignOutError(null)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Sign-out failed. Please try again.'
      setSignOutError(message)
    }
  }

  function handleToggleEscalation(checked: boolean) {
    setPrefsError(null)
    prefsMutation.mutate({ escalationNotifications: checked })
    setLiveAnnouncement(
      `Escalation notifications ${checked ? 'enabled' : 'disabled'}`
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>

      {loading ? (
        /* Loading skeleton — shown while AuthContext resolves */
        <div className="space-y-4">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-16" />
          <SkeletonCard className="h-16" />
        </div>
      ) : (
        <>
          {/* ── Profile header ── */}
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <ProfileAvatar
              photoURL={user?.photoURL ?? null}
              displayName={user?.displayName ?? null}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-gray-900">
                {user?.displayName ?? '—'}
              </p>
              <p className="truncate text-sm text-gray-500">
                {user?.email ?? '—'}
              </p>
              {role && (
                <div className="mt-2">
                  <RoleBadge role={role} />
                </div>
              )}
            </div>
          </div>

          {/* ── Notification preferences section (tasks 6.1 & 6.2) ── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">
              Notification Preferences
            </h2>

            {prefsLoading ? (
              /* Skeleton while preferences are loading */
              <SkeletonCard className="h-10" />
            ) : prefsIsError ? (
              /* Error state — show ErrorBanner with retry; hide toggle */
              <ErrorBanner
                message="Failed to load notification preferences."
                onRetry={() => void prefsRefetch()}
              />
            ) : (
              <>
                {/* Inline error from a failed PATCH */}
                {prefsError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {prefsError}
                  </div>
                )}

                {/* Escalation notifications toggle */}
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-gray-700">
                    Escalation event notifications
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs?.escalationNotifications ?? false}
                    disabled={prefsMutation.isPending}
                    onChange={(e) => handleToggleEscalation(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Escalation event notifications"
                  />
                </label>

                {/* aria-live region for announcing toggle state changes to screen readers */}
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  className="sr-only"
                >
                  {liveAnnouncement}
                </div>
              </>
            )}
          </div>

          {/* ── Sign-out section ── */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Session</h2>

            {signOutError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {signOutError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
