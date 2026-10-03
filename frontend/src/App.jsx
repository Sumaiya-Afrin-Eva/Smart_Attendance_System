import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/auth/Login'
import Placeholder from './pages/Placeholder'
import Onboarding from './pages/student/Onboarding'
import StudentDashboard from './pages/student/StudentDashboard'
import MyAttendance from './pages/student/MyAttendance'
import MyCourses from './pages/student/MyCourses'
import MyProfile from './pages/student/MyProfile'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import TeacherMyCourses from './pages/teacher/TeacherMyCourses'
import TeacherCourses from './pages/teacher/TeacherCourses'
import TeacherHistory from './pages/teacher/TeacherHistory'
import TeacherAnalytics from './pages/teacher/TeacherAnalytics'
import TeacherSettings from './pages/teacher/TeacherSettings'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCourses from './pages/admin/AdminCourses'
import TeacherManagement from './pages/admin/TeacherManagement'
import StudentManagement from './pages/admin/StudentManagement'
import SecurityAlerts from './pages/admin/SecurityAlerts'
import SystemSettings from './pages/admin/SystemSettings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Teacher */}
      <Route element={<ProtectedRoute role="teacher" />}>
        <Route path="/teacher" element={<DashboardLayout />}>
          <Route index element={<TeacherDashboard />} />
          <Route path="my-courses" element={<TeacherMyCourses />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="history" element={<TeacherHistory />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
          <Route path="settings" element={<TeacherSettings />} />
        </Route>
      </Route>

      {/* Student: first-time registration (profile -> face -> courses) */}
      <Route element={<ProtectedRoute role="student" setupPage />}>
        <Route path="/student/setup" element={<Onboarding />} />
      </Route>

      {/* Student: only after registration is complete */}
      <Route element={<ProtectedRoute role="student" />}>
        <Route path="/student" element={<DashboardLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="attendance" element={<MyAttendance />} />
          <Route path="courses" element={<MyCourses />} />
          <Route path="profile" element={<MyProfile />} />
        </Route>
      </Route>

      {/* Admin */}
      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<DashboardLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="courses" element={<AdminCourses />} />
          <Route path="teachers" element={<TeacherManagement />} />
          <Route path="students" element={<StudentManagement />} />
          <Route path="users" element={<TeacherManagement />} />
          <Route path="alerts" element={<SecurityAlerts />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
