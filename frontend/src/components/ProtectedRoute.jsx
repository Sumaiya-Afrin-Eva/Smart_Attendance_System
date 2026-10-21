import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

export default function ProtectedRoute({ role, setupStep }) {
  const { user, onboarding, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />                          // not logged in
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />    // wrong role

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
