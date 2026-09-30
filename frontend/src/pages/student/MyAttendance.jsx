import { useMemo, useState } from 'react'
import {
  BookOpen, Calendar, CalendarX,
  MapPin, ScanFace, UserCheck, ShieldCheck,
} from 'lucide-react'
import { useAttendanceHistory, useDashboard } from '../../lib/queries'
import { errorMessage } from '../../lib/api'
import { formatDate, formatMarks, formatPercent, formatTime } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorBox, GRADE_TONE, STATUS_LABEL, STATUS_TONE, Spinner } from '../../components/ui'
import SemesterSelect from '../../components/student/SemesterSelect'

const FILTERS = ['all', 'present', 'late', 'absent']
const METHOD_CONFIG = {
  face: { label: 'Face Recognition Scan', icon: ScanFace, tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  manual: { label: 'Teacher Verified', icon: UserCheck, tone: 'text-stone-800 bg-stone-100 border-stone-200' },
  backup: { label: 'Backup Check-in', icon: ShieldCheck, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
}

export default function MyAttendance() {
  const [semester, setSemester] = useState()
  const [courseId, setCourseId] = useState('')
  const [filter, setFilter] = useState('all')
  const history = useAttendanceHistory(semester)
  const dashboard = useDashboard(semester)

  const rows = useMemo(
    () =>
      (history.data?.rows ?? []).filter(
        (r) => (!courseId || r.course_id === Number(courseId)) && (filter === 'all' || r.status === filter),
      ),
    [history.data, courseId, filter],
  )
  const selectedCourse = dashboard.data?.courses.find((c) => c.id === Number(courseId))

  const counts = useMemo(() => {
    const base = (history.data?.rows ?? []).filter((r) => !courseId || r.course_id === Number(courseId))
    return Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? base.length : base.filter((r) => r.status === f).length]))
  }, [history.data, courseId])

  if (history.isLoading || dashboard.isLoading) return <Spinner label="Loading attendance history…" />
  if (history.error) return <ErrorBox>{errorMessage(history.error)}</ErrorBox>

  return (
    <div className="space-y-7">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900">Attendance History &amp; Logs</h2>
          <p className="mt-1 text-sm text-stone-500 font-medium">
            Semester {history.data?.semester} verified biometric and session records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <SemesterSelect value={semester} onChange={(s) => { setSemester(s); setCourseId('') }} />
          <div className="relative">
            <select
              aria-label="Filter by course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-11 rounded-xl border border-stone-300/80 bg-white px-4 pr-9 text-sm font-semibold text-stone-800 shadow-2xs outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
            >
              <option value="">All Registered Courses</option>
              {dashboard.data?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Selected Course Overview Banner */}
      {selectedCourse && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-white to-emerald-50/30 p-5 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-2xs">
              <BookOpen size={19} />
            </div>
            <div>
              <p className="font-display text-base font-bold text-stone-900">{selectedCourse.title}</p>
              <p className="text-xs sm:text-sm text-stone-500 font-medium">{selectedCourse.code} · {selectedCourse.type}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-sm">
            <div className="rounded-xl bg-white px-3.5 py-1.5 border border-stone-200 shadow-2xs">
              <span className="text-stone-500">Attendance: </span>
              <strong className="font-bold text-stone-900 font-mono">{formatPercent(selectedCourse.percent)}</strong>
            </div>
            <div className="rounded-xl bg-white px-3.5 py-1.5 border border-stone-200 shadow-2xs">
              <span className="text-stone-500">Marks: </span>
              <strong className="font-bold text-stone-900 font-mono">{formatMarks(selectedCourse)}</strong>
            </div>
            <Badge tone={GRADE_TONE[selectedCourse.grade]} withDot>
              {selectedCourse.label}
            </Badge>
          </div>
        </div>
      )}

      {/* Filter Status Tabs */}
      <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'border border-stone-200/90 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300'
              }`}
            >
              <span>{f === 'all' ? 'All Sessions' : STATUS_LABEL[f]}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                  active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
                }`}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Attendance History Table Card */}
      <Card>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-[#f0eee6] bg-stone-50/70 text-xs font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-6 py-4">Date &amp; Schedule</th>
                  <th className="px-6 py-4">Course Name</th>
                  <th className="px-6 py-4">Classroom</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Verification Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee6]">
                {rows.map((r) => {
                  const methodCfg = METHOD_CONFIG[r.method] || METHOD_CONFIG.manual
                  const MethodIcon = methodCfg.icon
                  return (
                    <tr key={r.session_id} className="transition-colors hover:bg-stone-50/60">
                      <td className="whitespace-nowrap px-6 py-4.5">
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                            <Calendar size={17} />
                          </div>
                          <div>
                            <p className="font-display text-sm font-bold text-stone-900">{formatDate(r.start_at)}</p>
                            <p className="text-xs sm:text-sm text-stone-500 font-mono">
                              {formatTime(r.start_at)} – {formatTime(r.end_at)}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4.5">
                        <p className="font-display text-sm sm:text-base font-bold text-stone-900">{r.course_title}</p>
                        <p className="text-xs sm:text-sm text-stone-500 font-medium">{r.course_code}</p>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4.5 text-sm font-medium text-stone-600">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin size={14} className="text-stone-400" />
                          {r.room ?? 'Room TBA'}
                        </span>
                      </td>

                      <td className="px-6 py-4.5">
                        <Badge tone={STATUS_TONE[r.status]} withDot>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4.5">
                        {r.marked_at ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${methodCfg.tone}`}>
                                <MethodIcon size={13} />
                                {methodCfg.label}
                              </span>
                            </div>
                            <span className="block font-mono text-xs text-stone-500">
                              Logged at {formatTime(r.marked_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-stone-400 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CalendarX}
            title="No matching records found"
            text="There are no attendance records matching your active filters."
          />
        )}
      </Card>
    </div>
  )
}
