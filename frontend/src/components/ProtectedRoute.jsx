import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from './ui'

export default function ProtectedRoute({ role, setupStep }) {
  const { user, onboarding, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />

  const isRoleAllowed = () => {
    if (!user) return false
    if (user.role === 'super_admin') return true
    const roleList = Array.isArray(role) ? role : [role]
    if (roleList.includes(user.role)) return true
    if (roleList.includes('admin') && (user.role.endsWith('_admin') || user.role === 'admin')) return true
    if (roleList.includes('system_admin') && (user.role.endsWith('_system_admin') || user.role === 'system_admin')) return true
    return false
  }

  const allowed = isRoleAllowed()
  if (!allowed) {
    let defaultRoute = '/admin/system-admin'
    if (user.role === 'super_admin') defaultRoute = '/admin/super-admin'
    else if (user.role === 'system_admin' || user.role === 'cse_system_admin') defaultRoute = '/admin/system-admin'
    else if (user.role === 'admin' || user.role === 'cse_admin') defaultRoute = '/admin/student-admin'
    else if (user.role === 'eee_system_admin') defaultRoute = '/admin/eee-system-admin'
    else if (user.role === 'eee_admin') defaultRoute = '/admin/eee-student-admin'
    else if (user.role?.endsWith('_system_admin')) defaultRoute = `/admin/${user.role.replace('_system_admin', '').toLowerCase()}-system-admin`
    else if (user.role?.endsWith('_admin')) defaultRoute = `/admin/${user.role.replace('_admin', '').toLowerCase()}-student-admin`
    else defaultRoute = `/${user.role}`
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
