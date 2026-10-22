import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

export default function ProtectedRoute({ role, setupStep }) {
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
    if (!registered && !setupStep) {
      return <Navigate to={onboarding?.profile ? '/student/setup/face' : '/student/setup'} replace />
    }
    if (registered && setupStep) return <Navigate to="/student" replace />
    if (setupStep === 'profile' && onboarding?.profile) {
      return <Navigate to={onboarding?.face ? '/student' : '/student/setup/face'} replace />
    }
    if (setupStep === 'face' && !onboarding?.profile) {
      return <Navigate to="/student/setup" replace />
    }
  }

  return <Outlet />
}
