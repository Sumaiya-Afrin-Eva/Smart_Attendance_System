import { useEffect, useState } from 'react'
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
  ArrowUpRight,
  BadgeCheck,
  Shield,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'

const summaryCards = [
  {
    label: 'Total teachers',
    value: '128',
    change: '+12.4%',
    icon: BriefcaseBusiness,
    tone: 'emerald',
  },
  {
    label: 'Total students',
    value: '4,284',
    change: '+8.1%',
    icon: GraduationCap,
    tone: 'sky',
  },
  {
    label: 'Active classes',
    value: '86',
    change: '+6 classes',
    icon: BookOpen,
    tone: 'amber',
  },
  {
    label: 'Attendance rate',
    value: '94.7%',
    change: '+2.3%',
    icon: TrendingUp,
    tone: 'violet',
  },
]

const teacherRows = [
  {
    name: 'Dr. Rahman Uddin',
    dept: 'CSE',
    email: 'rahman@kuet.ac.bd',
    courses: 4,
    students: 182,
    status: 'Active',
  },
  {
    name: 'Dr. Shila Akter',
    dept: 'EEE',
    email: 'shila@kuet.ac.bd',
    courses: 3,
    students: 138,
    status: 'Active',
  },
  {
    name: 'Md. Tanvir Islam',
    dept: 'CSE',
    email: 'tanvir@kuet.ac.bd',
    courses: 2,
    students: 96,
    status: 'On leave',
  },
  {
    name: 'Sadia Noor',
    dept: 'CSE',
    email: 'sadia@kuet.ac.bd',
    courses: 5,
    students: 210,
    status: 'Active',
  },
]

const studentRows = [
  {
    name: 'Amit Hasan',
    id: '2207001',
    dept: 'CSE',
    semester: '3-2',
    section: 'A',
    status: 'Present',
    attendance: '96%',
  },
  {
    name: 'Nusrat Jahan',
    id: '2207045',
    dept: 'CSE',
    semester: '3-2',
    section: 'A',
    status: 'Late',
    attendance: '88%',
  },
  {
    name: 'Shuvo Kumar',
    id: '2106107',
    dept: 'EEE',
    semester: '4-1',
    section: 'B',
    status: 'Absent',
    attendance: '74%',
  },
  {
    name: 'Farhana Ali',
    id: '2207124',
    dept: 'CSE',
    semester: '3-2',
    section: 'C',
    status: 'Present',
    attendance: '98%',
  },
]

const eeeTeacherRows = [
  {
    name: 'Dr. Shila Akter',
    dept: 'EEE',
    email: 'shila@kuet.ac.bd',
    courses: 4,
    students: 182,
    status: 'Active',
  },
  {
    name: 'Dr. Md. Rafiqul Islam',
    dept: 'EEE',
    email: 'rafiqul@kuet.ac.bd',
    courses: 3,
    students: 145,
    status: 'Active',
  },
  {
    name: 'Dr. Bashir Ahmed',
    dept: 'EEE',
    email: 'bashir@kuet.ac.bd',
    courses: 3,
    students: 130,
    status: 'Active',
  },
  {
    name: 'Engr. Farhana Yasmin',
    dept: 'EEE',
    email: 'farhana.eee@kuet.ac.bd',
    courses: 2,
    students: 88,
    status: 'On leave',
  },
]

const eeeStudentRows = [
  {
    name: 'Shuvo Kumar',
    id: '2106107',
    dept: 'EEE',
    semester: '4-1',
    section: 'B',
    status: 'Present',
    attendance: '94%',
  },
  {
    name: 'Fahim Shahriar',
    id: '2206015',
    dept: 'EEE',
    semester: '3-2',
    section: 'A',
    status: 'Present',
    attendance: '96%',
  },
  {
    name: 'Anika Tabassum',
    id: '2206042',
    dept: 'EEE',
    semester: '3-2',
    section: 'A',
    status: 'Late',
    attendance: '88%',
  },
  {
    name: 'Tanvir Ahmed',
    id: '2206088',
    dept: 'EEE',
    semester: '3-2',
    section: 'B',
    status: 'Absent',
    attendance: '74%',
  },
]

const toneMap = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  slate: 'bg-stone-100 text-stone-700 ring-stone-200',
}

export default function AdminDashboard({ mode = 'department', department = 'CSE', roleType = 'System Admin' }) {
  const { switchDashboard } = useAuth()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  
  // Teachers filters
  const [teacherSearch, setTeacherSearch] = useState('')
  const [teacherDept, setTeacherDept] = useState('ALL')

  // Students filters
  const [studentSearch, setStudentSearch] = useState('')
  const [studentDept, setStudentDept] = useState('ALL')
  const [studentTerm, setStudentTerm] = useState('ALL')
  const [studentSession, setStudentSession] = useState('ALL')

  const [dbTeachers, setDbTeachers] = useState([])
  const [dbStudents, setDbStudents] = useState([])
  const [overviewStats, setOverviewStats] = useState(null)
  const isSuper = mode === 'super'
  const title = isSuper ? 'Super Admin Dashboard' : `${department} ${roleType} Dashboard`
  const subtitle = isSuper
    ? 'Unified access to both CSE and EEE administrative areas.'
    : `${department} administrative overview and department controls.`

  useEffect(() => {
    async function loadData() {
      try {
        const [statsRes, teachersRes, studentsRes] = await Promise.all([
          api.get('/admin/overview-stats').catch(() => ({ data: null })),
          api.get('/admin/teachers').catch(() => ({ data: [] })),
          api.get('/admin/students').catch(() => ({ data: [] })),
        ])
        if (statsRes?.data) setOverviewStats(statsRes.data)
        if (Array.isArray(teachersRes?.data)) setDbTeachers(teachersRes.data)
        if (Array.isArray(studentsRes?.data)) setDbStudents(studentsRes.data)
      } catch {
        // Fallback to static values if endpoints fail
      }
    }
    loadData()
  }, [department])

  // Map real teachers from DB
  const rawTeachers = dbTeachers.map((t) => ({
    name: t.name,
    dept: t.department || department,
    email: t.email,
    courses: t.courses || 0,
    students: t.students || 0,
    status: t.status || 'Active',
    semesters: t.semesters || [],
    sessions: t.sessions || [],
  }))

  const teacherHasActiveFilter = Boolean(
    teacherSearch.trim() ||
    teacherDept !== 'ALL'
  )

  const teachersList = teacherHasActiveFilter
    ? rawTeachers.filter((t) => {
        if (teacherSearch.trim()) {
          const q = teacherSearch.toLowerCase()
          const matches =
            t.name.toLowerCase().includes(q) ||
            t.email.toLowerCase().includes(q) ||
            t.dept.toLowerCase().includes(q)
          if (!matches) return false
        }
        if (teacherDept !== 'ALL' && t.dept !== teacherDept) return false
        return true
      })
    : []

  // Map real students from DB
  const rawStudents = dbStudents.map((s) => ({
    name: s.name || s.full_name,
    id: s.roll,
    dept: s.department || department,
    semester: s.semester || s.current_semester || '1-1',
    session: s.session || '2025-2026',
    section: s.section || 'A',
    status: 'Present',
    attendance: '100%',
  }))

  const studentHasActiveFilter = Boolean(
    studentSearch.trim() ||
    studentDept !== 'ALL' ||
    studentTerm !== 'ALL' ||
    studentSession !== 'ALL'
  )

  const studentsList = studentHasActiveFilter
    ? rawStudents.filter((s) => {
        if (studentSearch.trim()) {
          const q = studentSearch.toLowerCase()
          const matches =
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.id && String(s.id).toLowerCase().includes(q)) ||
            (s.dept && s.dept.toLowerCase().includes(q)) ||
            (s.semester && s.semester.toLowerCase().includes(q)) ||
            (s.session && s.session.toLowerCase().includes(q))
          if (!matches) return false
        }
        if (studentDept !== 'ALL' && s.dept !== studentDept) return false
        if (studentTerm !== 'ALL' && s.semester !== studentTerm) return false
        if (studentSession !== 'ALL' && s.session !== studentSession) return false
        return true
      })
    : []

  const cards = [
    {
      label: 'Total teachers',
      value: overviewStats ? String(overviewStats.total_teachers) : (department === 'EEE' ? '0' : '28'),
      change: overviewStats?.total_teachers ? `+${overviewStats.total_teachers}` : '0',
      icon: BriefcaseBusiness,
      tone: 'emerald',
    },
    {
      label: 'Total students',
      value: overviewStats ? String(overviewStats.total_students) : (department === 'EEE' ? '0' : '10'),
      change: overviewStats?.total_students ? `+${overviewStats.total_students}` : '0',
      icon: GraduationCap,
      tone: 'sky',
    },
    {
      label: 'Active classes',
      value: overviewStats ? String(overviewStats.active_classes) : (department === 'EEE' ? '0' : '261'),
      change: overviewStats?.active_classes ? `${overviewStats.active_classes} classes` : '0 classes',
      icon: BookOpen,
      tone: 'amber',
    },
    {
      label: 'Attendance rate',
      value: overviewStats ? overviewStats.attendance_rate : (department === 'EEE' ? '0.0%' : '94.7%'),
      change: overviewStats?.total_students ? '+2.3%' : '0%',
      icon: TrendingUp,
      tone: 'violet',
    },
  ]

  const superLinks = [
    { label: 'CSE System Admin', path: '/admin/system-admin', role: 'system_admin', icon: Shield },
    { label: 'CSE Student Admin', path: '/admin/student-admin', role: 'admin', icon: GraduationCap },
    { label: 'EEE System Admin', path: '/admin/eee-system-admin', role: 'eee_system_admin', icon: Shield },
    { label: 'EEE Student Admin', path: '/admin/eee-student-admin', role: 'eee_admin', icon: GraduationCap },
  ]

  const handleSuperLinkClick = async (e, link) => {
    e.preventDefault()
    if (switching) return
    setSwitching(true)
    try {
      if (switchDashboard && link.role) {
        await switchDashboard(link.role)
      }
      navigate(link.path)
    } catch (err) {
      console.error('Failed to switch dashboard:', err)
      navigate(link.path)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">{isSuper ? 'Unified control' : `${department} overview`}</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">{title}</h2>
            <p className="mt-2 text-sm text-stone-600">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer">
              <CalendarRange size={16} />
              This semester
            </button>
          </div>
        </div>
      </section>

      {isSuper && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Direct access</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">Department dashboards</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {superLinks.map((link) => {
              const { label, path, icon: Icon } = link
              return (
                <button
                  key={path}
                  type="button"
                  onClick={(e) => handleSuperLinkClick(e, link)}
                  disabled={switching}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50 cursor-pointer disabled:opacity-50"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Icon size={18} />
                  </div>
                  <p className="text-base font-bold text-stone-900">{label}</p>
                  <p className="mt-1 text-xs text-stone-500">Open dashboard & switch view</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, change, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${toneMap[tone]}`}>
                <Icon size={18} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{change}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        {/* Search Teachers */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty management</p>
              <h3 className="mt-1 font-display text-2xl font-bold text-stone-900">Search Teachers</h3>
            </div>
            {teacherHasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setTeacherSearch('')
                  setTeacherDept('ALL')
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer self-start sm:self-auto"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Teacher Search & Filter Controls */}
          <div className="mt-4 space-y-3">
            <div className="relative flex w-full items-center rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
              <Search size={18} className="text-stone-400 shrink-0 mr-3" />
              <input
                type="text"
                placeholder="Type teacher name, email, or department..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              />
              {teacherSearch && (
                <button
                  type="button"
                  onClick={() => setTeacherSearch('')}
                  className="ml-2 text-stone-400 hover:text-stone-600 text-xs font-semibold px-2 py-1 rounded bg-stone-200/60 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Dropdown */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-500">Dept:</span>
                <select
                  value={teacherDept}
                  onChange={(e) => setTeacherDept(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  <option value="CSE">CSE</option>
                  <option value="EEE">EEE</option>
                </select>
              </div>
            </div>
          </div>

          {teacherHasActiveFilter ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Teacher</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Courses</th>
                    <th className="px-4 py-3 font-semibold">Students</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {teachersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-stone-500">
                        No teachers found matching selected filters.
                      </td>
                    </tr>
                  ) : (
                    teachersList.map((teacher) => (
                      <tr key={teacher.email} className="hover:bg-stone-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-800">
                              {teacher.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                            </div>
                            <div>
                              <p className="font-semibold text-stone-900">{teacher.name}</p>
                              <p className="text-xs text-stone-500">{teacher.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-stone-700">{teacher.dept}</td>
                        <td className="px-4 py-3 text-stone-700">{teacher.courses}</td>
                        <td className="px-4 py-3 text-stone-700">{teacher.students}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${teacher.status === 'Active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                            {teacher.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
              Type or select Department filter above to look up specific teacher records.
            </div>
          )}
        </div>

        {/* Search Students */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Student directory</p>
              <h3 className="mt-1 font-display text-2xl font-bold text-stone-900">Search Students</h3>
            </div>
            {studentHasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setStudentSearch('')
                  setStudentDept('ALL')
                  setStudentTerm('ALL')
                  setStudentSession('ALL')
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer self-start sm:self-auto"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Student Search & Filter Controls */}
          <div className="mt-4 space-y-3">
            <div className="relative flex w-full items-center rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
              <Search size={18} className="text-stone-400 shrink-0 mr-3" />
              <input
                type="text"
                placeholder="Type student name, roll number, department, or semester..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              />
              {studentSearch && (
                <button
                  type="button"
                  onClick={() => setStudentSearch('')}
                  className="ml-2 text-stone-400 hover:text-stone-600 text-xs font-semibold px-2 py-1 rounded bg-stone-200/60 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-500">Dept:</span>
                <select
                  value={studentDept}
                  onChange={(e) => setStudentDept(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  <option value="CSE">CSE</option>
                  <option value="EEE">EEE</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-500">Term:</span>
                <select
                  value={studentTerm}
                  onChange={(e) => setStudentTerm(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="ALL">All Terms</option>
                  {['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-500">Session:</span>
                <select
                  value={studentSession}
                  onChange={(e) => setStudentSession(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="ALL">All Sessions</option>
                  {['2022-2023', '2023-2024', '2024-2025', '2025-2026', '2026-2027'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {studentHasActiveFilter ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">ID / Roll</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Term</th>
                    <th className="px-4 py-3 font-semibold">Session</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {studentsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-stone-500">
                        No students found matching selected filters.
                      </td>
                    </tr>
                  ) : (
                    studentsList.map((student) => (
                      <tr key={student.id} className="hover:bg-stone-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-800">
                              {student.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                            </div>
                            <div>
                              <p className="font-semibold text-stone-900">{student.name}</p>
                              <p className="text-xs text-stone-500">Section {student.section}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-stone-700 font-mono text-xs font-semibold">{student.id}</td>
                        <td className="px-4 py-3 text-stone-700">{student.dept}</td>
                        <td className="px-4 py-3 text-stone-700">{student.semester}</td>
                        <td className="px-4 py-3 text-stone-700">{student.session}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${student.status === 'Present' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : student.status === 'Late' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
                            {student.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-stone-800">{student.attendance}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
              Type or select Dept / Term / Session filters above to look up specific student records.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
