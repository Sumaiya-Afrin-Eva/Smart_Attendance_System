import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ role }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />          // লগইন করেনি
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />  // ভুল রোল

  return <Outlet />
}