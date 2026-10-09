import { useQuery } from '@tanstack/react-query'
import api from './api'

const get = (url, params) => api.get(url, { params }).then((r) => r.data)

// Departments, semesters and the marking rule
export const useMeta = () =>
  useQuery({ queryKey: ['meta'], queryFn: () => get('/meta'), staleTime: Infinity })

export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => get('/students/me/profile') })

export const useEnrollments = () =>
  useQuery({ queryKey: ['enrollments'], queryFn: () => get('/students/me/enrollments') })

export const useCourses = (department, semester, session) =>
  useQuery({
    queryKey: ['courses', department, semester, session],
    queryFn: () => get('/courses', { department, semester, session }),
    enabled: Boolean(department && semester && session),
  })

export const useDashboard = (semester) =>
  useQuery({
    queryKey: ['dashboard', semester ?? 'current'],
    queryFn: () => get('/students/me/dashboard', { semester }),
    refetchInterval: 10_000,
  })

export const useAttendanceHistory = (semester) =>
  useQuery({
    queryKey: ['attendance', semester ?? 'current'],
    queryFn: () => get('/students/me/attendance', { semester }),
  })
