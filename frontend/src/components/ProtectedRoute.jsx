import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

// setupPage=true marks the student registration page itself
export default function ProtectedRoute({ role, setupPage = false }) {
  const { user, onboarding, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />                          // not logged in
  const allowed = Array.isArray(role) ? role.includes(user.role) : user.role === role
  if (!allowed) {
    const defaultRoute = user.role === 'system_admin' ? '/admin' : `/${user.role}`
    return <Navigate to={defaultRoute} replace />
  }

  if (role === 'student') {
    const registered = onboarding?.complete
    if (!registered && !setupPage) return <Navigate to="/student/setup" replace />  // finish registration first
    if (registered && setupPage) return <Navigate to="/student" replace />
  }

  return <Outlet />
}
