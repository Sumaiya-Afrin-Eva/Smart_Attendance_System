import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Award, BookOpen, CalendarCheck, CalendarX, CheckCircle2, ChevronRight,
  Clock, Info, MapPin, Percent, Sparkles, TrendingUp, TriangleAlert, ScanFace,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useDashboard } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatDate, formatMarks, formatPercent, formatTime, relativeDay } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, GRADE_TONE, STATUS_LABEL, STATUS_TONE, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

const COLORS = {
  teal: '#0d9488',
  tealLight: '#14b8a6',
  slate: '#475569',
  amber: '#d97706',
  rose: '#e11d48',
  emerald: '#059669',
  grid: '#f1f5f9',
  axis: '#94a3b8',
}

const GRADE_COLOR = {
  full: '#059669',
  partial: '#d97706',
  incomplete: '#e11d48',
  no_classes: '#cbd5e1',
}

function StatCard({ icon: Icon, label, value, hint, variant = 'default', trend }) {
  const styles = {
    default: 'border-slate-200/80 bg-white hover:border-slate-300',
    brand: 'border-teal-200/70 bg-gradient-to-br from-teal-50/60 via-white to-white',
    danger: 'border-rose-200/70 bg-rose-50/40 text-rose-900',
    success: 'border-emerald-200/70 bg-emerald-50/40 text-emerald-900',
  }

  const iconStyles = {
    default: 'bg-slate-100 text-slate-600',
    brand: 'bg-teal-700 text-white shadow-2xs',
    danger: 'bg-rose-600 text-white shadow-2xs',
    success: 'bg-emerald-600 text-white shadow-2xs',
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-2xs transition-all duration-200 hover:shadow-xs ${styles[variant]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <div className={`flex h-9.5 w-9.5 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconStyles[variant]}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="font-display text-3xl font-extrabold tracking-tight text-slate-800">{value}</p>
        {trend && (
          <span className="flex items-center text-xs font-semibold text-emerald-600">
            <TrendingUp size={13} className="mr-0.5" />
            {trend}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-slate-500 font-medium">{hint}</p>
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
        className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className="animate-progress h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: GRADE_COLOR[course.grade] }}
        />
      </div>
      {/* Threshold markers */}
      <div className="absolute -top-1 inset-x-0 pointer-events-none h-4">
        {[rule.incomplete_below, rule.full_at].map((mark) => (
          <span
            key={mark}
            className="absolute top-0 h-4 w-0.5 -translate-x-1/2 bg-slate-400/50"
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
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/90 p-3 text-xs text-white shadow-md backdrop-blur-md">
      <p className="mb-1.5 font-bold text-slate-200">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? p.payload.fill }} />
            {p.name}:
          </span>
          <span className="font-bold text-white">{Math.round(p.value)}%</span>
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
      {/* Soothing Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-teal-600/20 bg-gradient-to-r from-[#0e2233] via-[#142e44] to-[#1a3a54] p-6 text-white shadow-xs lg:p-7">
        {/* Soft atmospheric glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-60 w-60 rounded-full bg-teal-500/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-60 w-60 rounded-full bg-sky-500/10 blur-2xl" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-950/60 px-3 py-1 text-xs font-semibold text-teal-200">
              <Sparkles size={13} className="text-teal-300" />
              <span>KUET Computer Science &amp; Engineering</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white lg:text-3xl">
              {greeting}, {firstName} 👋
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-300/90 leading-relaxed">
              Semester {data.semester} face recognition attendance tracker. You have attended{' '}
              <strong className="text-white">{s.attended}</strong> out of{' '}
              <strong className="text-white">{s.held}</strong> scheduled classes with an overall average of{' '}
              <strong className="text-teal-300">{formatPercent(s.percent)}</strong>.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <SemesterSelect value={semester} onChange={setSemester} />
            <div className="flex items-center gap-1.5 text-xs text-teal-200 font-medium">
              <CheckCircle2 size={14} className="text-teal-400" />
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
          hint={`${s.courses} registered courses this semester`}
          variant="brand"
        />
        <StatCard
          icon={CalendarCheck}
          label="Classes Attended"
          value={`${s.attended} / ${s.held}`}
          hint="Late entries included in marks"
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
          hint={s.incomplete ? `Below minimum ${rule.incomplete_below}% criteria` : 'All courses above threshold'}
          variant={s.incomplete ? 'danger' : 'default'}
        />
      </div>

      {courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No courses registered for this semester"
            text="Please complete course selection to view attendance analytics."
            action={
              <Link
                to="/student/courses"
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-teal-800"
              >
                Register Courses <ChevronRight size={14} />
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Courses Progress Table / List */}
          <Card
            title="Course Attendance & Marks"
            subtitle={`Marking benchmark: ≥${rule.full_at}% = ${rule.full_marks} Marks · <${rule.incomplete_below}% = Incomplete`}
            icon={BookOpen}
          >
            <ul className="divide-y divide-slate-100">
              {courses.map((c) => (
                <li
                  key={c.id}
                  className="grid gap-4 px-6 py-4 transition-colors hover:bg-slate-50/70 sm:grid-cols-12 sm:items-center"
                >
                  <div className="min-w-0 sm:col-span-5">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-sm font-bold text-slate-800">{c.title}</p>
                      <Badge tone={c.type === 'Lab' ? 'brand' : 'slate'} className="text-[10px]">
                        {c.type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 font-medium">
                      <span className="font-semibold text-slate-700">{c.code}</span> · {c.attended}/{c.held} classes held
                      {c.late > 0 && <span className="text-amber-700 font-semibold"> · {c.late} late</span>}
                    </p>
                  </div>

                  <div className="sm:col-span-4">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500">Progress</span>
                      <span className="text-slate-800">{formatPercent(c.percent)}</span>
                    </div>
                    <AttendanceBar course={c} rule={rule} />
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:col-span-3 sm:justify-end">
                    <span className="font-display text-sm font-bold text-slate-800">
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
                      <ReferenceLine y={rule.full_at} stroke={COLORS.teal} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <ReferenceLine y={rule.incomplete_below} stroke={COLORS.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="weekly"
                        name="Weekly Rate"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#94a3b8' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        name="Cumulative Rate"
                        stroke={COLORS.teal}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: COLORS.teal }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={CalendarX} title="No trend records yet" />
              )}
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                  <span className="h-1 w-4 rounded-full bg-teal-700" /> Cumulative
                </span>
                <span className="flex items-center gap-1.5 font-medium text-slate-500">
                  <span className="h-1 w-4 rounded-full bg-slate-400" /> Weekly
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-teal-600" /> {rule.full_at}% Full target
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
                    <ReferenceLine y={rule.full_at} stroke={COLORS.teal} strokeDasharray="4 4" strokeOpacity={0.6} />
                    <ReferenceLine y={rule.incomplete_below} stroke={COLORS.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="percent" name="Attendance Rate" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {byCourse.map((c) => (
                        <Cell key={c.name} fill={GRADE_COLOR[c.grade]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Full Marks (≥90%)
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Partial (60-89%)
                </span>
                <span className="flex items-center gap-1.5 font-medium">
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
                  className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  View All History <ChevronRight size={14} />
                </Link>
              }
            >
              {recent.length ? (
                <ul className="divide-y divide-slate-100">
                  {recent.map((r) => (
                    <li key={r.session_id} className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50/60">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold text-slate-900">{r.course_title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">{r.course_code}</span> · {formatDate(r.start_at)} · {formatTime(r.start_at)}
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
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((c) => (
                    <li key={c.session_id} className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-slate-50/60">
                      <div className="w-18 shrink-0 rounded-xl border border-teal-100 bg-teal-50/50 py-2 text-center shadow-2xs">
                        <p className="font-display text-xs font-bold text-teal-950">{formatTime(c.start_at)}</p>
                        <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider">{relativeDay(c.start_at)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-xs font-bold text-slate-900">{c.course_title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin size={12} className="text-slate-400" />
                          <span>{c.room ?? 'Room TBA'}</span>
                          <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-600">{c.type}</span>
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
      <div className="flex items-start gap-3.5 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50/50 via-slate-50/80 to-white p-5 shadow-2xs">
        <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-2xs">
          <Info size={18} />
        </div>
        <div className="space-y-1">
          <p className="font-display text-xs font-bold text-slate-900">KUET Academic Attendance Marks Breakdown</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Attendance marks are evaluated per course: Students achieving <strong>≥{rule.full_at}%</strong> receive the maximum{' '}
            <strong>{rule.full_marks} marks</strong>. Between <strong>{rule.incomplete_below}%–{rule.full_at}%</strong> marks are scaled proportionally.
            Falling below <strong>{rule.incomplete_below}%</strong> results in an <strong>Incomplete</strong> status with 0 attendance marks.
          </p>
        </div>
      </div>
    </div>
  )
}
