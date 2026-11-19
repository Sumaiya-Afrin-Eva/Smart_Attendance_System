import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api, { TOKEN_KEY, errorMessage } from '../lib/api'

const defaultAuthValue = {
  user: null,
  onboarding: null,
  loading: false,
  login: async () => {},
  bootstrapAdmin: async () => {},
  loginWithGoogle: async () => {},
  devLogin: async () => {},
  switchDashboard: async () => {},
  returnToSuperAdmin: async () => false,
  logout: () => {},
  refresh: async () => {},
  setOnboarding: () => {},
}

const AuthContext = createContext(defaultAuthValue)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(null)
  // For students: which registration steps are done { profile, face, courses, complete }
  const [onboarding, setOnboarding] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  const SUPER_ADMIN_BACKUP_KEY = 'super_admin_backup_token'

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(SUPER_ADMIN_BACKUP_KEY)
    setUser(null)
    setOnboarding(null)
    queryClient.clear()
  }, [queryClient])

  // On page load: if a token is saved, ask the backend who we are
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user)
        setOnboarding(data.onboarding)
      })
      .catch(logout)
      .finally(() => setLoading(false))
  }, [logout])

  // Token expired while using the app
  useEffect(() => {
    window.addEventListener('auth:expired', logout)
    return () => window.removeEventListener('auth:expired', logout)
  }, [logout])

  const startSession = (data) => {
    localStorage.setItem(TOKEN_KEY, data.access_token)
    if (data.user?.role === 'super_admin') {
      localStorage.setItem(SUPER_ADMIN_BACKUP_KEY, data.access_token)
    }
    setUser(data.user)
    setOnboarding(data.onboarding)
    return { ...data.user, onboarding: data.onboarding }
  }

  const call = async (url, body) => {
    try {
      const { data } = await api.post(url, body)
      return startSession(data)
    } catch (error) {
      throw new Error(errorMessage(error))
    }
  }

  // Teachers and admins: email + password
  const login = (email, password, access_code) => call('/auth/login', { email, password, access_code })
  const bootstrapAdmin = (email, name, password, access_code) =>
    call('/auth/bootstrap-admin', { email, name, password, access_code })

  // Students: Google access token (from popup flow). The BACKEND verifies it with Google's userinfo API.
  const loginWithGoogle = (credential) => call('/auth/google', { credential })

  // Testing without Google (only works while DEV_LOGIN_ENABLED=true on the backend)
  const devLogin = (email) => call('/auth/dev-login', { email })

  // Switch between admin dashboards (for super_admin direct access)
  const switchDashboard = async (targetRole) => {
    try {
      const backupToken = localStorage.getItem(SUPER_ADMIN_BACKUP_KEY)
      const headers = backupToken ? { Authorization: `Bearer ${backupToken}` } : {}
      const { data } = await api.post('/auth/switch-dashboard', { target_role: targetRole }, { headers })
      return startSession(data)
    } catch (error) {
      throw new Error(errorMessage(error))
    }
  }

  // Return back to super admin from any switched dashboard
  const returnToSuperAdmin = async () => {
    const backupToken = localStorage.getItem(SUPER_ADMIN_BACKUP_KEY)
    if (backupToken) {
      localStorage.setItem(TOKEN_KEY, backupToken)
      await refresh()
      return true
    }
    return false
  }

  // Re-read the user after changing the profile, e.g. new name
  const refresh = async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.user)
    setOnboarding(data.onboarding)
  }

  return (
    <AuthContext.Provider
      value={{ user, onboarding, loading, login, bootstrapAdmin, loginWithGoogle, devLogin, switchDashboard, returnToSuperAdmin, logout, refresh, setOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext) || defaultAuthValue
