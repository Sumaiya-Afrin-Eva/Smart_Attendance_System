import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

// setupPage=true marks the student registration page itself
export default function ProtectedRoute({ role, setupPage = false }) {
  const { user, onboarding, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />                          // not logged in
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />    // wrong role

  if (role === 'student') {
    const registered = onboarding?.complete
    if (!registered && !setupPage) return <Navigate to="/student/setup" replace />  // finish registration first
    if (registered && setupPage) return <Navigate to="/student" replace />
  }

  return <Outlet />
}
