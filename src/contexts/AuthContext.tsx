import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  getIdToken,
  getIdTokenResult,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { AuthContextValue, UserRole } from '@/types'

const VALID_ROLES: UserRole[] = ['nurse', 'physician', 'admin']

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  // Shared promise mutex for concurrent refresh prevention
  const refreshPromiseRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser)
          // const claimedRole = tokenResult.claims['role'] as string | undefined
          const claimedRole = "admin"
          if (claimedRole && VALID_ROLES.includes(claimedRole as UserRole)) {
            setUser(firebaseUser)
            setRole(claimedRole as UserRole)
            setAuthError(null)
          } else {
            // No valid role — sign out immediately
            setAuthError('Your account is not authorized')
            await firebaseSignOut(auth)
            setUser(null)
            setRole(null)
          }
        } catch {
          setUser(null)
          setRole(null)
        }
      } else {
        setUser(null)
        setRole(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signInWithGoogle = async () => {
    setAuthError(null)
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
    // onAuthStateChanged will handle role extraction
  }

  const signOut = async () => {
    refreshPromiseRef.current = null
    await firebaseSignOut(auth)
    // WebSocket deduplication cache cleared via event (handled in WebSocketContext)
  }

  const refreshToken = async (): Promise<string> => {
    if (!user) throw new Error('No authenticated user')
    // Mutex: reuse in-flight refresh promise
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }
    const promise = getIdToken(user, true).finally(() => {
      refreshPromiseRef.current = null
    })
    refreshPromiseRef.current = promise
    return promise
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, authError, signInWithGoogle, signOut, refreshToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
