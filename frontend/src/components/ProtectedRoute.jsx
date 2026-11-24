import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

export default function ProtectedRoute({ role, setupStep }) {
  const { user, onboarding, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />

  const allowed = Array.isArray(role) ? (role.includes(user.role) || user.role === 'super_admin') : (user.role === role || user.role === 'super_admin')
  if (!allowed) {
    const defaultRoute = user.role === 'super_admin'
      ? '/admin/super-admin'
      : user.role === 'system_admin'
        ? '/admin/system-admin'
        : user.role === 'eee_system_admin'
          ? '/admin/eee-system-admin'
          : user.role === 'eee_admin'
            ? '/admin/eee-student-admin'
            : '/admin/student-admin'
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
