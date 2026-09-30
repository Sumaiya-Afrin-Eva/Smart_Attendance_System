import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Award, BookOpen, CalendarCheck, CalendarX, CheckCircle2, ChevronRight,
  Clock, Info, MapPin, Percent, Sparkles, TrendingUp, TriangleAlert,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useDashboard } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatDate, formatMarks, formatPercent, formatTime, relativeDay } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, GRADE_TONE, STATUS_LABEL, STATUS_TONE, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

const COLORS = {
  emerald: '#059669',
  emeraldLight: '#10b981',
  teal: '#0f766e',
  slate: '#57534e',
  amber: '#d97706',
  rose: '#e11d48',
  grid: '#f0eee6',
  axis: '#78716c',
}

const GRADE_COLOR = {
  full: '#059669',
  partial: '#d97706',
  incomplete: '#e11d48',
  no_classes: '#d6d3d1',
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
      className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 ${styles[variant]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{label}</p>
        <div className={`flex h-9.5 w-9.5 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconStyles[variant]}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="font-display text-3xl font-extrabold tracking-tight text-stone-900">{value}</p>
        {trend && (
          <span className="flex items-center text-xs font-semibold text-emerald-700">
            <TrendingUp size={13} className="mr-0.5" />
            {trend}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-stone-500 font-medium">{hint}</p>
    </div>
  )
}

function AttendanceBar({ course, rule }) {
  const pct = course.percent ?? 0
  return (
    <div className="relative mt-2">
      <div
        role="progressbar"
        aria-label={`${course.title} attendance`}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-stone-100 border border-stone-200/60"
      >
        <div
          className="h-full rounded-full transition-all duration-500 shadow-2xs"
          style={{ width: `${pct}%`, backgroundColor: GRADE_COLOR[course.grade] }}
        />
      </div>
      {/* Threshold markers */}
      <div className="absolute -top-1 inset-x-0 pointer-events-none h-4">
        {[rule.incomplete_below, rule.full_at].map((mark) => (
          <span
            key={mark}
            className="absolute top-0 h-4 w-0.5 -translate-x-1/2 bg-stone-400/50"
            style={{ left: `${mark}%` }}
            title={`Threshold: ${mark}%`}
          />
        ))}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-stone-700/60 bg-stone-900/90 p-3 text-xs text-white shadow-lg backdrop-blur-md">
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

  const { summary: s, courses, trend, recent, upcoming, marking_rule: rule } = data
  const firstName = user.name.split(' ')[0]
  const byCourse = courses.map((c) => ({ name: c.code, percent: c.percent ?? 0, grade: c.grade }))

  // Time-of-day greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      {/* Botanical Forest Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-900/20 bg-gradient-to-r from-[#0f3422] via-[#14422c] to-[#184d34] p-6 text-white shadow-sm lg:p-7">
        {/* Soft glowing ambient orbs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 px-3.5 py-1 text-xs font-semibold text-emerald-200 shadow-2xs">
              <Sparkles size={13} className="text-emerald-300" />
              <span>KUET Computer Science &amp; Engineering</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white lg:text-3xl">
              {greeting}, {firstName} 👋
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              Semester {data.semester} automated face recognition log tracker. You have attended{' '}
              <strong className="text-white">{s.attended}</strong> of{' '}
              <strong className="text-white">{s.held}</strong> scheduled lectures with an overall attendance of{' '}
              <strong className="text-emerald-300 font-semibold">{formatPercent(s.percent)}</strong>.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <SemesterSelect value={semester} onChange={setSemester} />
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-200 font-medium shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-300" />
              <span>Face Recognition Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Percent}
          label="Overall Attendance"
          value={formatPercent(s.percent)}
          hint={`${s.courses} registered courses this term`}
          variant="brand"
        />
        <StatCard
          icon={CalendarCheck}
          label="Classes Attended"
          value={`${s.attended} / ${s.held}`}
          hint="Late check-ins counted in marks"
          variant="default"
        />
        <StatCard
          icon={Award}
          label="Estimated Marks"
          value={s.marks_possible ? `${s.marks_obtained} / ${s.marks_possible}` : '—'}
          hint={`${s.full} full marks · ${s.partial} partial`}
          variant="success"
        />
        <StatCard
          icon={TriangleAlert}
          label="Incomplete Risk"
          value={s.incomplete}
          hint={s.incomplete ? `Below minimum ${rule.incomplete_below}% criteria` : 'All courses above safe threshold'}
          variant={s.incomplete ? 'danger' : 'default'}
        />
      </div>

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No courses registered for this semester"
            text="Please complete course selection to activate biometric attendance tracking."
            action={
              <Link
                to="/student/courses"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-800 to-teal-800 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:from-emerald-700 hover:to-teal-700"
              >
                Register Courses <ChevronRight size={14} />
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Courses Progress Table */}
          <Card
            title="Course Attendance & Marks"
            subtitle={`Marking benchmark: ≥${rule.full_at}% = ${rule.full_marks} Marks · <${rule.incomplete_below}% = Incomplete`}
            icon={BookOpen}
          >
            <ul className="divide-y divide-[#f0eee6]">
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="grid gap-4 px-6 py-4 transition-colors hover:bg-stone-50/70 sm:grid-cols-12 sm:items-center"
                >
                  <div className="min-w-0 sm:col-span-5">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-sm font-bold text-stone-900">{c.title}</p>
                      <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-[10px]">
                        {c.type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500 font-medium">
                      <span className="font-semibold text-stone-700">{c.code}</span> · {c.attended}/{c.held} lectures
                      {c.late > 0 && <span className="text-amber-700 font-semibold"> · {c.late} late</span>}
                    </p>
                  </div>

                  <div className="sm:col-span-4">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-stone-500">Progress</span>
                      <span className="text-stone-900 font-mono">{formatPercent(c.percent)}</span>
                    </div>
                    <AttendanceBar course={c} rule={rule} />
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:col-span-3 sm:justify-end">
                    <span className="font-display text-sm font-bold text-stone-900 font-mono">
                      {formatMarks(c, rule.full_marks)}
                    </span>
                    <Badge tone={GRADE_TONE[c.grade]} withDot>
                      {c.label}
                    </Badge>
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
                <div className="h-64 px-2 py-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.axis }} tickLine={false} axisLine={false} />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 60, 90, 100]}
                        tick={{ fontSize: 11, fill: COLORS.axis }}
                        tickLine={false}
                        axisLine={false}
                        unit="%"
                      />
                      <ReferenceLine y={rule.full_at} stroke={COLORS.emerald} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <ReferenceLine y={rule.incomplete_below} stroke={COLORS.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="weekly"
                        name="Weekly Rate"
                        stroke="#a8a29e"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#a8a29e' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        name="Cumulative Rate"
                        stroke={COLORS.emerald}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: COLORS.emerald }}
                        activeDot={{ r: 6, fill: COLORS.emeraldLight }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={CalendarX} title="No trend records yet" />
              )}
              <div className="flex flex-wrap items-center gap-4 border-t border-[#f0eee6] px-5 py-3 text-xs text-stone-500">
                <span className="flex items-center gap-1.5 font-medium text-stone-800">
                  <span className="h-1 w-4 rounded-full bg-emerald-700" /> Cumulative
                </span>
                <span className="flex items-center gap-1.5 font-medium text-stone-500">
                  <span className="h-1 w-4 rounded-full bg-stone-400" /> Weekly
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-emerald-600" /> {rule.full_at}% Target
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-rose-500" /> {rule.incomplete_below}% Limit
                </span>
              </div>
            </Card>

            {/* By Course Bar Chart */}
            <Card title="Attendance By Course" subtitle="Comparison against marking benchmarks" icon={Award}>
              <div className="h-64 px-2 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byCourse} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.axis }} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 60, 90, 100]}
                      tick={{ fontSize: 11, fill: COLORS.axis }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                    />
                    <ReferenceLine y={rule.full_at} stroke={COLORS.emerald} strokeDasharray="4 4" strokeOpacity={0.6} />
                    <ReferenceLine y={rule.incomplete_below} stroke={COLORS.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(28, 25, 23, 0.02)' }} />
                    <Bar dataKey="percent" name="Attendance Rate" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {byCourse.map((c) => (
                        <Cell key={c.name} fill={GRADE_COLOR[c.grade]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-[#f0eee6] px-5 py-3 text-xs text-stone-500">
                <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Full (≥90%)
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Partial (60-89%)
                </span>
                <span className="flex items-center gap-1.5 font-medium text-rose-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Incomplete (&lt;60%)
                </span>
              </div>
            </Card>
          </div>

          {/* Recent Classes & Upcoming Timeline */}
          <div className="grid gap-6 lg:grid-cols-5">
            <Card
              title="Recent Class Records"
              subtitle="Face recognition attendance logs"
              className="lg:col-span-3"
              icon={Clock}
              action={
                <Link
                  to="/student/attendance"
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-900"
                >
                  View All History <ChevronRight size={14} />
                </Link>
              }
            >
              {recent.length ? (
                <ul className="divide-y divide-[#f0eee6]">
                  {recent.map((r) => (
                    <li key={r.session_id} className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-stone-50/60">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold text-stone-900">{r.course_title}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          <span className="font-semibold text-stone-700">{r.course_code}</span> · {formatDate(r.start_at)} · {formatTime(r.start_at)}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[r.status]} withDot>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={CalendarX} title="No classes recorded yet" />
              )}
            </Card>

            <Card title="Upcoming Schedule" subtitle="Scheduled classes for your batch" className="lg:col-span-2" icon={CalendarCheck}>
              {upcoming.length ? (
                <ul className="divide-y divide-[#f0eee6]">
                  {upcoming.map((c) => (
                    <li key={c.session_id} className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-stone-50/60">
                      <div className="w-18 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/60 py-2 text-center shadow-2xs">
                        <p className="font-display text-xs font-bold text-stone-900 font-mono">{formatTime(c.start_at)}</p>
                        <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">{relativeDay(c.start_at)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-xs font-bold text-stone-900">{c.course_title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                          <MapPin size={12} className="text-stone-400" />
                          <span>{c.room ?? 'Room TBA'}</span>
                          <span className="rounded bg-stone-100 px-1 text-[10px] font-semibold text-stone-600">{c.type}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={CalendarCheck} title="No classes scheduled" text="Enjoy your free time!" />
              )}
            </Card>
          </div>
        </>
      )}

      {/* Marks Calculation Guide Banner */}
      <div className="flex items-start gap-3.5 rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/60 via-stone-50/50 to-white p-5 shadow-2xs">
        <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-emerald-300/80 bg-emerald-100 text-emerald-900 shadow-2xs">
          <Info size={18} />
        </div>
        <div className="space-y-1">
          <p className="font-display text-xs font-bold text-stone-900">KUET Academic Attendance Marks Breakdown</p>
          <p className="text-xs text-stone-600 leading-relaxed">
            Attendance marks are evaluated per course: Students achieving <strong>≥{rule.full_at}%</strong> receive the maximum{' '}
            <strong className="text-emerald-800">{rule.full_marks} marks</strong>. Between <strong>{rule.incomplete_below}%–{rule.full_at}%</strong> marks are scaled proportionally.
            Falling below <strong>{rule.incomplete_below}%</strong> results in an <strong className="text-rose-700">Incomplete</strong> status with 0 attendance marks.
          </p>
        </div>
      </div>
    </div>
  )
}
