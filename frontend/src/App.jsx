import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/auth/Login'
import PasswordRecovery from './pages/auth/PasswordRecovery'
import Placeholder from './pages/Placeholder'
import Onboarding from './pages/student/Onboarding'
import FaceEnrollment from './pages/student/FaceEnrollment'
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
import AdminRoutine from './pages/admin/AdminRoutine'
import AdminTeacherAssignment from './pages/admin/AdminTeacherAssignment'
import TeacherManagement from './pages/admin/TeacherManagement'
import StudentManagement from './pages/admin/StudentManagement'
import StudentRosterForm from './pages/admin/StudentRosterForm'
import StudentTermManagement from './pages/admin/StudentTermManagement'
import StudentCourseAssignments from './pages/admin/StudentCourseAssignments'
import SecurityAlerts from './pages/admin/SecurityAlerts'
import SystemSettings from './pages/admin/SystemSettings'

import FaceLab from './pages/biometrics/FaceLab'
import { useAuth } from './context/AuthContext'

function AdminDashboardRouter() {
  const { user } = useAuth()
  if (user?.role === 'admin') {
    return <Navigate to="students" replace />
  }
  return <AdminDashboard />
}

export default function App() {
  useEffect(() => {
    const moveFocus = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches('input, select, textarea')) return
      if (target instanceof HTMLTextAreaElement) return

      const form = target.closest('form')
      if (!form) return
      const fields = [...form.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        .filter((field) => field.offsetParent !== null)
      const currentIndex = fields.indexOf(target)
      if (currentIndex < 0) return

      const atStart = target instanceof HTMLInputElement && target.selectionStart === 0 && target.selectionEnd === 0
      const atEnd = target instanceof HTMLInputElement
        && target.selectionStart === target.value.length
        && target.selectionEnd === target.value.length
      const shouldMoveNext = event.key === 'Enter' || (event.key === 'ArrowRight' && atEnd)
      const shouldMovePrevious = event.key === 'ArrowUp' || (event.key === 'ArrowLeft' && atStart)
      if (!shouldMoveNext && !shouldMovePrevious) return

      const nextIndex = shouldMoveNext ? currentIndex + 1 : currentIndex - 1
      const nextField = fields[nextIndex]
      if (!nextField) return
      event.preventDefault()
      nextField.focus()
      if (nextField instanceof HTMLInputElement) nextField.select()
    }

    document.addEventListener('keydown', moveFocus)
    return () => document.removeEventListener('keydown', moveFocus)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<PasswordRecovery />} />
      <Route path="/reset-password" element={<PasswordRecovery />} />

      {/* Teacher */}
      <Route element={<ProtectedRoute role="teacher" />}>
        <Route path="/teacher" element={<DashboardLayout />}>
          <Route index element={<TeacherDashboard />} />
          <Route path="my-courses" element={<TeacherMyCourses />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="biometrics" element={<FaceLab />} />
          <Route path="history" element={<TeacherHistory />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
          <Route path="settings" element={<TeacherSettings />} />
        </Route>
      </Route>

      {/* Student: profile setup is one-time; face enrollment is tracked per semester */}
      <Route element={<ProtectedRoute role="student" setupStep="profile" />}>
        <Route path="/student/setup" element={<Onboarding />} />
      </Route>
      <Route element={<ProtectedRoute role="student" setupStep="face" />}>
        <Route path="/student/setup/face" element={<FaceEnrollment />} />
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

      {/* Admin (System Administrator & Student Administrator) */}
      <Route element={<ProtectedRoute role={['admin', 'system_admin']} />}>
        <Route path="/admin" element={<DashboardLayout />}>
          <Route index element={<AdminDashboardRouter />} />
          <Route path="courses" element={<AdminCourses />} />
          <Route path="routine" element={<AdminRoutine />} />
          <Route path="assignments" element={<AdminTeacherAssignment />} />
          <Route path="teachers" element={<TeacherManagement />} />
          <Route path="students" element={<StudentManagement />} />
          <Route path="students/new" element={<StudentRosterForm />} />
          <Route path="students/:studentId/edit" element={<StudentRosterForm />} />
          <Route path="student-terms" element={<StudentTermManagement />} />
          <Route path="student-assignments" element={<StudentCourseAssignments />} />
          <Route path="course-assignments" element={<StudentCourseAssignments />} />
          <Route path="alerts" element={<SecurityAlerts />} />
          <Route path="settings" element={<SystemSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>

      {/* Dedicated Standalone Classroom Kiosk Mode */}
      <Route path="/kiosk" element={<FaceLab />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
