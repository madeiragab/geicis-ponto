import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { auth } from '../api/endpoints'
import { clearTokens, getRefreshToken, setTokens } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    const { data } = await auth.me()
    setUser(data)
    setProfile(data.student_profile || data.professor_profile || null)
    return data
  }, [])

  // On boot, an existing refresh token is exchanged for a session. The request
  // interceptor handles the refresh, so a plain /me call is enough.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!getRefreshToken()) {
        setLoading(false)
        return
      }
      try {
        const { data } = await auth.refresh(getRefreshToken())
        setTokens({ access: data.access, refresh: data.refresh })
        if (!cancelled) await loadMe()
      } catch {
        clearTokens()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [loadMe])

  const login = useCallback(
    async (email, password) => {
      const { data } = await auth.login(email, password)
      setTokens({ access: data.access, refresh: data.refresh })
      await loadMe()
      return data.user
    },
    [loadMe],
  )

  const logout = useCallback(async () => {
    const refresh = getRefreshToken()
    if (refresh) {
      try {
        await auth.logout(refresh)
      } catch {
        // Blacklisting failed, but the session ends locally either way.
      }
    }
    clearTokens()
    setUser(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      login,
      logout,
      refreshProfile: loadMe,
      isStudent: user?.role === 'STUDENT',
      isProfessor: user?.role === 'PROFESSOR',
      isCoordinator: user?.role === 'COORDINATOR',
    }),
    [user, profile, loading, login, logout, loadMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
