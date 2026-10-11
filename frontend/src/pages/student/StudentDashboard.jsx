import { useState } from 'react'
import {
  BookOpen, CalendarCheck, CheckCircle2, ChevronRight, Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDashboard } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatPercent } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [semester, setSemester] = useState()
  const { data, isLoading, error } = useDashboard(semester)

  if (isLoading) return <Spinner label="Loading attendance dashboard…" />
  if (error) return <ErrorBox>{errorMessage(error)}</ErrorBox>

  const { courses } = data
  const firstName = user.name.split(' ')[0]

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
              <span>KUET Computer Science &amp; Engineering</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white lg:text-4xl">
              {greeting}, {firstName} 👋
            </h2>
            <p className="mt-2.5 text-sm sm:text-base text-emerald-100/90 leading-relaxed">
              Semester {data.semester} automated face recognition log tracker. Attendance is shown separately for each assigned course.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3.5">
            <SemesterSelect value={semester} onChange={setSemester} />
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/40 px-3.5 py-1 text-xs sm:text-sm text-emerald-200 font-medium shadow-2xs">
              <CheckCircle2 size={15} className="text-emerald-300" />
              <span>Face Recognition Active</span>
            </div>
          </div>
        </div>
      </div>

      <Card
        title="Today's class attendance"
        subtitle="Attendance recorded by the classroom kiosk"
        icon={CalendarCheck}
      >
        {data.today?.length ? (
          <ul className="divide-y divide-[#f0eee6]">
            {data.today.map((item) => (
              <li key={item.session_id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="font-semibold text-stone-900">{item.course_title}</p>
                  <p className="mt-1 text-xs font-medium text-stone-500">{item.course_code}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.status === 'present'
                    ? 'bg-emerald-100 text-emerald-800'
                    : item.status === 'late'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {item.status === 'present' ? 'Present' : item.status === 'late' ? 'Late' : 'Absent'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-5 text-sm text-stone-500">No class attendance has been recorded today.</div>
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
