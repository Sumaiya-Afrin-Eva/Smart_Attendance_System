import { useState } from 'react'
import {
  BookOpen, CalendarCheck, ChevronRight, Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDashboard, useProfile } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatPercent } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

const DEPT_NAMES = {
  CSE: 'Computer Science & Engineering',
  EEE: 'Electrical & Electronic Engineering',
  ECE: 'Electronics & Communication Engineering',
  ME: 'Mechanical Engineering',
  CE: 'Civil Engineering',
  BME: 'Biomedical Engineering',
  IEM: 'Industrial Engineering & Management',
  MSE: 'Materials Science & Engineering',
  URP: 'Urban & Regional Planning',
  ARCH: 'Architecture',
  BECM: 'Building Engineering & Construction Management',
  LE: 'Leather Engineering',
  TE: 'Textile Engineering',
  CHE: 'Chemical Engineering',
  MTE: 'Mechatronics Engineering',
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [semester, setSemester] = useState()
  const { data, isLoading, error } = useDashboard(semester)
  const { data: profile } = useProfile()

  if (isLoading) return <Spinner label="Loading attendance dashboard…" />
  if (error) return <ErrorBox>{errorMessage(error)}</ErrorBox>

  const { courses } = data
  const firstName = user.name.split(' ')[0]

  const deptCode = (profile?.department || data?.department || 'CSE').toUpperCase()
  const deptDisplayName = DEPT_NAMES[deptCode] || deptCode

  // Time-of-day greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-7">
      {/* Botanical Forest Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/20 bg-gradient-to-r from-[#0f3422] via-[#14422c] to-[#184d34] p-7 text-white shadow-sm lg:p-8">
        {/* Soft glowing ambient orbs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 px-4 py-1.5 text-xs sm:text-sm font-semibold text-emerald-200 shadow-2xs">
              <Sparkles size={14} className="text-emerald-300" />
              <span>{deptDisplayName}</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white lg:text-4xl">
              {greeting}, {firstName} 👋
            </h2>
          </div>

          <div className="flex flex-col items-end gap-3.5">
            <SemesterSelect value={semester} onChange={setSemester} />
          </div>
        </div>
      </div>

      <Card
        title="Today's class attendance"
        subtitle="Today's classes from your routine"
        icon={CalendarCheck}
      >
        {data.today?.length ? (
          <ul className="divide-y divide-[#f0eee6]">
            {data.today.map((item, idx) => (
              <li key={item.routine_id ? `${item.routine_id}-${idx}` : idx} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="font-semibold text-stone-900">{item.course_title}</p>
                  <p className="mt-1 text-xs font-medium text-stone-500">
                    {item.course_code}
                    {item.start_time && item.end_time ? ` · ${item.start_time} - ${item.end_time}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.status === 'present'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {item.status === 'present' ? 'Present' : 'Absent'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-5 text-sm text-stone-500">No classes are scheduled for you today.</div>
        )}
      </Card>

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No courses assigned for this semester"
            text="Courses assigned by your student administrator will appear here."
          />
        </Card>
      ) : (
        <>
          <Card
            title="My Assigned Courses"
            subtitle="Select a course to view its attendance history"
            icon={BookOpen}
          >
            <ul className="divide-y divide-[#f0eee6]">
              {courses.map((c, index) => (
                <li
                  key={c.id}
                  className="transition-colors hover:bg-emerald-50/40"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/student/attendance?course_id=${c.id}`)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-stone-900">{c.code}</span>
                        <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-xs">{c.type}</Badge>
                      </span>
                      <span className="mt-1 block truncate text-sm text-stone-600">{c.title}</span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="block font-mono text-sm font-bold text-stone-900">{formatPercent(c.percent)}</span>
                      <span className="text-xs text-stone-500">{c.attended}/{c.held} classes</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-stone-400" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

        </>
      )}
    </div>
  )
}
