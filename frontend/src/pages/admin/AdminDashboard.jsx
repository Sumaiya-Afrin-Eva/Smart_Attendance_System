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
  const [searchQuery, setSearchQuery] = useState('')
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
  }))

  const teachersList = rawTeachers.filter((t) =>
    !searchQuery ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.dept.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Map real students from DB
  const studentsList = dbStudents.map((s) => ({
    name: s.name || s.full_name,
    id: s.roll,
    dept: s.department || department,
    semester: s.semester || s.current_semester || '1-1',
    section: s.section || 'A',
    status: 'Present',
    attendance: '100%',
  }))

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

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty management</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">Teachers</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search teacher"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-40 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
              />
            </div>
          </div>

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
                      No teachers added yet for {department}.
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
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Quick actions</p>
                <h3 className="mt-2 text-xl font-bold text-stone-900">Manage users</h3>
              </div>
              <button className="inline-flex items-center justify-center rounded-xl bg-emerald-800 p-2 text-white hover:bg-emerald-700 cursor-pointer">
                <Plus size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {[
                { label: 'Approve new faculty', count: '14', icon: UserCheck, tone: 'emerald' },
                { label: 'Pending student verification', count: '29', icon: ShieldCheck, tone: 'amber' },
                { label: 'Face sync issues', count: '5', icon: BadgeCheck, tone: 'rose' },
              ].map(({ label, count, icon: Icon, tone }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneMap[tone]}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-800">{label}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Performance</p>
                <h3 className="mt-2 text-xl font-bold text-stone-900">Attendance health</h3>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <TrendingUp size={16} />
                <span className="text-sm font-semibold">+2.3%</span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {[{ label: 'Faculty engagement', value: '91%' }, { label: 'Student compliance', value: '87%' }, { label: 'Report accuracy', value: '96%' }].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-stone-600">{item.label}</span>
                    <span className="font-semibold text-stone-900">{item.value}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-stone-100">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500"
                      style={{ width: item.value }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Student directory</p>
            <h3 className="mt-2 text-2xl font-bold text-stone-900">Students</h3>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer">
            <UserRound size={16} />
            Export list
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
            <thead className="bg-stone-50 text-stone-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Student</th>
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Semester</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {studentsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-stone-500">
                    No students enrolled yet for {department}.
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
                    <td className="px-4 py-3 text-stone-700">{student.id}</td>
                    <td className="px-4 py-3 text-stone-700">{student.dept}</td>
                    <td className="px-4 py-3 text-stone-700">{student.semester}</td>
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
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty communication</p>
              <h3 className="mt-2 text-xl font-bold text-stone-900">Recent notices</h3>
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer">
              <Mail size={15} />
              Send mail
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {[
              'Semester exam timetable has been published for all departments.',
              'Faculty login verification is now required for every new account.',
              'Attendance threshold alert has been triggered by 14 classes.',
            ].map((notice) => (
              <div key={notice} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                  <CheckCircle2 size={14} />
                </div>
                <p className="text-sm leading-6 text-stone-700">{notice}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Operations</p>
              <h3 className="mt-2 text-xl font-bold text-stone-900">Current session</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
              <Clock3 size={14} />
              2025-2026
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Departments', value: '12' },
              { label: 'Programs', value: '18' },
              { label: 'Active courses', value: '86' },
              { label: 'Pending approvals', value: '21' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm text-stone-500">{stat.label}</p>
                <p className="mt-3 text-2xl font-bold text-stone-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
