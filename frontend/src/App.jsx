import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/auth/Login'
import Placeholder from './pages/Placeholder'
import StudentDashboard from './pages/student/StudentDashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Teacher */}
      <Route element={<ProtectedRoute role="teacher" />}>
        <Route path="/teacher" element={<DashboardLayout />}>
          <Route index element={<Placeholder title="Teacher Dashboard" />} />
          <Route path="courses" element={<Placeholder title="Courses & Classes" />} />
          <Route path="live" element={<Placeholder title="Live Roster" />} />
          <Route path="reports" element={<Placeholder title="Reports" />} />
        </Route>
      </Route>

      {/* Student */}
      <Route element={<ProtectedRoute role="student" />}>
        <Route path="/student" element={<DashboardLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="attendance" element={<Placeholder title="My Attendance" />} />
          <Route path="courses" element={<Placeholder title="Courses" />} />
          <Route path="face" element={<Placeholder title="Face Enrollment" />} />
        </Route>
      </Route>

      {/* Admin */}
      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<DashboardLayout />}>
          <Route index element={<Placeholder title="Admin Dashboard" />} />
          <Route path="users" element={<Placeholder title="User Management" />} />
          <Route path="alerts" element={<Placeholder title="Security Alerts" />} />
          <Route path="settings" element={<Placeholder title="Settings" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}