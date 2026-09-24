import { BookOpen, CalendarCheck, MapPin, Percent, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const REQUIRED_PERCENT = 75

// Mock data. Replace with API calls (TanStack Query) once the backend exists.
const COURSES = [
  { code: 'CSE 3200', title: 'System Development Project', attended: 14, total: 16 },
  { code: 'CSE 3211', title: 'Computer Networks', attended: 22, total: 24 },
  { code: 'CSE 3221', title: 'Operating Systems', attended: 12, total: 17 },
  { code: 'CSE 3231', title: 'Database Management Systems', attended: 17, total: 20 },
  { code: 'MATH 3201', title: 'Numerical Methods', attended: 11, total: 14 },
]

const UPCOMING = [
  { title: 'Operating Systems', day: 'Today', time: '10:00 AM', room: 'Room 302', type: 'Theory' },
  { title: 'Computer Networks Lab', day: 'Today', time: '2:30 PM', room: 'Lab 4', type: 'Lab' },
  { title: 'Database Management Systems', day: 'Tomorrow', time: '9:00 AM', room: 'Room 105', type: 'Theory' },
]

const percentOf = (attended, total) => Math.round((attended / total) * 100)

const TONES = {
  brand: 'bg-brand/10 text-brand',
  danger: 'bg-red-50 text-red-600',
}

function StatCard({ icon: Icon, label, value, hint, tone = 'brand' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-navy-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const firstName = user.name.split(' ')[0]
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const attended = COURSES.reduce((sum, c) => sum + c.attended, 0)
  const total = COURSES.reduce((sum, c) => sum + c.total, 0)
  const atRisk = COURSES.filter((c) => percentOf(c.attended, c.total) < REQUIRED_PERCENT).length

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-navy-900">Welcome back, {firstName}</h2>
        <p className="mt-1 text-sm text-slate-500">{today}</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Percent}
          label="Overall attendance"
          value={`${percentOf(attended, total)}%`}
          hint={`Minimum required: ${REQUIRED_PERCENT}%`}
        />
        <StatCard
          icon={CalendarCheck}
          label="Classes attended"
          value={`${attended} / ${total}`}
          hint="This semester"
        />
        <StatCard
          icon={BookOpen}
          label="Enrolled courses"
          value={COURSES.length}
          hint="Current semester"
        />
        <StatCard
          icon={TriangleAlert}
          label="Courses at risk"
          value={atRisk}
          hint={atRisk ? `Below ${REQUIRED_PERCENT}% attendance` : 'All courses on track'}
          tone={atRisk ? 'danger' : 'brand'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Attendance by course */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-3">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-navy-900">Attendance by course</h3>
            <p className="text-xs text-slate-500">Minimum required: {REQUIRED_PERCENT}%</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {COURSES.map((c) => {
              const pct = percentOf(c.attended, c.total)
              const low = pct < REQUIRED_PERCENT
              return (
                <li key={c.code} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{c.title}</p>
                      <p className="text-xs text-slate-500">
                        {c.code}, {c.attended} of {c.total} classes
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${low ? 'text-red-600' : 'text-navy-900'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${c.title} attendance`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-brand'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {low && (
                    <p className="mt-2 text-xs text-red-600">
                      Below the {REQUIRED_PERCENT}% requirement. Attend upcoming classes to recover.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {/* Upcoming classes */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-navy-900">Upcoming classes</h3>
            <p className="text-xs text-slate-500">Your next sessions</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {UPCOMING.map((c) => (
              <li key={`${c.day}-${c.time}`} className="flex items-center gap-4 px-5 py-4">
                <div className="w-20 shrink-0 rounded-lg bg-slate-50 py-2 text-center">
                  <p className="text-sm font-semibold text-navy-900">{c.time}</p>
                  <p className="text-xs text-slate-500">{c.day}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{c.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} />
                    {c.room}, {c.type}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}