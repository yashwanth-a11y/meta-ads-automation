import { useEffect, useState, useCallback } from 'react'
import { post, setAuthToken, clearAuthToken, getAuthToken } from '../api/client'

// Shape returned by `POST /api/v1/auth/login` and `/auth/signup`.
export type AuthUser = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  last_login_at?: string | null
  created_at: string
  updated_at: string
}
export type AuthResult = { user: AuthUser; token: string }

export type SignupInput = {
  first_name: string
  last_name: string
  email: string
  phone: string             // E.164 e.g. "+14155552671"
  password: string
  confirm_password: string
}
export type LoginInput = { email: string; password: string }

// Single source of truth on whether the app currently has a session token.
// Listens to the `auth:invalid` event so a 401 from anywhere flips this
// hook's state in real time and any guards re-render.
export function useAuth() {
  const [token, setToken] = useState<string | null>(getAuthToken())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onInvalid = () => setToken(null)
    window.addEventListener('auth:invalid', onInvalid)
    return () => window.removeEventListener('auth:invalid', onInvalid)
  }, [])

  const login = useCallback(async (input: LoginInput, persist = false) => {
    setLoading(true)
    try {
      const result = await post<AuthResult>('/auth/login', input)
      setAuthToken(result.token, persist)
      setToken(result.token)
      return result.user
    } finally {
      setLoading(false)
    }
  }, [])

  const signup = useCallback(async (input: SignupInput, persist = false) => {
    setLoading(true)
    try {
      const result = await post<AuthResult>('/auth/signup', input)
      setAuthToken(result.token, persist)
      setToken(result.token)
      return result.user
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setToken(null)
  }, [])

  return {
    isAuthenticated: !!token,
    token,
    loading,
    login,
    signup,
    logout,
  }
}
