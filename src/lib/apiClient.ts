import { getIdTokenResult, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const PROACTIVE_REFRESH_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

async function getValidToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const tokenResult = await getIdTokenResult(user)
  const expiresAt = new Date(tokenResult.expirationTime).getTime()
  const now = Date.now()
  if (expiresAt - now < PROACTIVE_REFRESH_THRESHOLD_MS) {
    return getIdToken(user, true)
  }
  return tokenResult.token
}

export async function apiClient<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getValidToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (response.status === 401) {
    // Reactive refresh: try once
    const user = auth.currentUser
    if (!user) throw new Error('Not authenticated')
    const freshToken = await getIdToken(user, true)
    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshToken}`,
        ...options.headers,
      },
    })
    if (retryResponse.status === 401) {
      // Second 401 — sign out
      await auth.signOut()
      throw new Error('Session expired. Please sign in again.')
    }
    if (!retryResponse.ok) {
      throw new Error(`API error: ${retryResponse.status}`)
    }
    return retryResponse.json() as Promise<T>
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}
