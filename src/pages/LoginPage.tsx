import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!loading && user) {
      const redirect = searchParams.get('redirect') ?? '/dashboard'
      navigate(redirect, { replace: true })
    }
  }, [user, loading, navigate, searchParams])

  return <div>Login</div>
}
