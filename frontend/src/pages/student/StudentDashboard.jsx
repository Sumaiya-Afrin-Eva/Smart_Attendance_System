import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  BookOpen, CalendarCheck, CalendarX, CheckCircle2, Percent, Sparkles, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useDashboard } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatPercent } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

const COLORS = {
  emerald: '#059669',
  emeraldLight: '#10b981',
  teal: '#0f766e',
  slate: '#57534e',
  grid: '#f0eee6',
  axis: '#78716c',
}

function StatCard({ icon: Icon, label, value, hint, variant = 'default', trend }) {
  const styles = {
    default: 'glass-card-interactive',
    brand: 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 via-white to-white shadow-2xs hover:border-emerald-300',
    danger: 'border-rose-200/90 bg-rose-50/50 shadow-2xs hover:border-rose-300',
    success: 'border-emerald-200/90 bg-emerald-50/50 shadow-2xs hover:border-emerald-300',
  }

  const iconStyles = {
    default: 'bg-stone-100 text-stone-600 border border-stone-200/60',
    brand: 'bg-emerald-800 text-white shadow-2xs',
    danger: 'bg-rose-600 text-white shadow-2xs',
    success: 'bg-emerald-700 text-white shadow-2xs',
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5.5 transition-all duration-200 ${styles[variant]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{label}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconStyles[variant]}`}>
          <Icon size={19} />
        </div>
      </div>
      <div className="mt-3.5 flex items-baseline gap-2.5">
        <p className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900">{value}</p>
        {trend && (
          <span className="flex items-center text-xs sm:text-sm font-semibold text-emerald-700">
            <TrendingUp size={14} className="mr-0.5" />
            {trend}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs sm:text-sm text-stone-600 font-medium">{hint}</p>
    </div>
  )
}

function AttendanceBar({ course }) {
  const pct = course.percent ?? 0
  return (
    <div className="relative mt-2.5">
      <div
        role="progressbar"
        aria-label={`${course.title} attendance`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-stone-100 border border-stone-200/60"
      >
        <div
          className="h-full rounded-full transition-all duration-500 shadow-2xs"
          style={{ width: `${pct}%`, backgroundColor: COLORS.emerald }}
        />
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-stone-700/60 bg-stone-900/90 p-3.5 text-xs sm:text-sm text-white shadow-lg backdrop-blur-md">
      <p className="mb-1.5 font-bold text-white">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 text-stone-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? p.payload.fill }} />
            {p.name}:
          </span>
          <span className="font-bold text-white font-mono">{Math.round(p.value)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const [semester, setSemester] = useState()
  const { data, isLoading, error } = useDashboard(semester)

  if (isLoading) return <Spinner label="Loading attendance dashboard…" />
  if (error) return <ErrorBox>{errorMessage(error)}</ErrorBox>

  const { summary: s, courses, trend } = data
  const firstName = user.name.split(' ')[0]
  const byCourse = courses.map((c) => ({ name: c.code, percent: c.percent ?? 0 }))

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
              Semester {data.semester} automated face recognition log tracker. You have attended{' '}
              <strong className="text-white">{s.attended}</strong> of{' '}
              <strong className="text-white">{s.held}</strong> scheduled lectures with an overall attendance of{' '}
              <strong className="text-emerald-300 font-semibold">{formatPercent(s.percent)}</strong>.
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

      {/* Summary Stat Cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        <StatCard
          icon={Percent}
          label="Overall Attendance"
          value={formatPercent(s.percent)}
          hint={`${s.courses} assigned courses this term`}
          variant="brand"
        />
        <StatCard
          icon={CalendarCheck}
          label="Classes Attended"
          value={`${s.attended} / ${s.held}`}
          hint="Late check-ins counted in marks"
          variant="default"
        />
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
          {/* Courses Progress Table */}
          <Card
            title="Course Attendance"
            subtitle="Attendance progress for each assigned course"
            icon={BookOpen}
          >
            <ul className="divide-y divide-[#f0eee6]">
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="grid gap-4 px-6 py-4.5 transition-colors hover:bg-stone-50/70 sm:grid-cols-12 sm:items-center"
                >
                  <div className="min-w-0 sm:col-span-5">
                    <div className="flex items-center gap-2.5">
                      <p className="truncate font-display text-base font-bold text-stone-900">{c.title}</p>
                      <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-xs">
                        {c.type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-stone-600 font-medium">
                      <span className="font-semibold text-stone-800">{c.code}</span> · {c.attended}/{c.held} lectures
                      {c.late > 0 && <span className="text-amber-750 font-semibold"> · {c.late} late</span>}
                    </p>
                  </div>

                  <div className="sm:col-span-4">
                    <div className="flex justify-between text-xs sm:text-sm font-semibold">
                      <span className="text-stone-500">Progress</span>
                      <span className="text-stone-900 font-mono">{formatPercent(c.percent)}</span>
                    </div>
                    <AttendanceBar course={c} />
                  </div>

                </li>
              ))}
            </ul>
          </Card>

          {/* Charts Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Trend Chart */}
            <Card title="Attendance Progression Trend" subtitle="Weekly vs Cumulative performance" icon={TrendingUp}>
              {trend.length ? (
                <div className="h-68 px-2 py-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 12, right: 20, bottom: 0, left: -5 }}>
                      <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: COLORS.axis }} tickLine={false} axisLine={false} />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tick={{ fontSize: 12, fill: COLORS.axis }}
                        tickLine={false}
                        axisLine={false}
                        unit="%"
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="weekly"
                        name="Weekly Rate"
                        stroke="#a8a29e"
                        strokeWidth={2}
                        dot={{ r: 3.5, fill: '#a8a29e' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        name="Cumulative Rate"
                        stroke={COLORS.emerald}
                        strokeWidth={2.5}
                        dot={{ r: 4.5, fill: COLORS.emerald }}
                        activeDot={{ r: 6.5, fill: COLORS.emeraldLight }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={CalendarX} title="No trend records yet" />
              )}
              <div className="flex flex-wrap items-center gap-4 border-t border-[#f0eee6] px-6 py-3.5 text-xs sm:text-sm text-stone-600">
                <span className="flex items-center gap-1.5 font-medium text-stone-900">
                  <span className="h-1.5 w-4 rounded-full bg-emerald-700" /> Cumulative
                </span>
                <span className="flex items-center gap-1.5 font-medium text-stone-500">
                  <span className="h-1.5 w-4 rounded-full bg-stone-400" /> Weekly
                </span>
              </div>
            </Card>

            {/* By Course Bar Chart */}
            <Card title="Attendance By Course" subtitle="Attendance percentage for each assigned course" icon={CalendarCheck}>
              <div className="h-68 px-2 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCourse} margin={{ top: 12, right: 20, bottom: 0, left: -5 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: COLORS.axis }} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fontSize: 12, fill: COLORS.axis }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(28, 25, 23, 0.02)' }} />
                    <Bar dataKey="percent" name="Attendance Rate" fill={COLORS.emerald} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

        </>
      )}
    </div>
  )
}
