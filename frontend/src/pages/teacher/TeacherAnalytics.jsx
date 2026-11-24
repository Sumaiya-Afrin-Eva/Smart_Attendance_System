import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNavigate, useParams } from 'react-router-dom'
import api, { errorMessage } from '../../lib/api'

function AttendanceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null

  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-stone-500">{point.date}</p>
      <p className="mt-1 text-sm font-bold text-stone-900">{point.percent}% attendance</p>
      <p className="text-xs text-stone-500">
        {point.presentCount} / {point.totalStudents} students present
      </p>
    </div>
  )
}

export default function TeacherAnalytics() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadCourses() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/teacher/attendance-sheets')
        if (!cancelled) setCourses(data)
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, 'Could not load course analytics.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCourses()
    return () => { cancelled = true }
  }, [reloadKey])

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.courseId) === courseId),
    [courses, courseId]
  )
  const retryLoad = () => setReloadKey((key) => key + 1)

  if (courseId) {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
          <button
            type="button"
            onClick={() => navigate('/teacher/analytics')}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-700"
          >
            <ArrowLeft size={16} />
            All courses
          </button>

          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading course analytics...</p>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{error}</span>
              <button type="button" onClick={retryLoad} className="font-semibold underline">Try again</button>
            </div>
          ) : selectedCourse ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {selectedCourse.session} · {selectedCourse.semester}, Section {selectedCourse.section}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">
                  {selectedCourse.courseCode}: {selectedCourse.courseTitle}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Attendance percentage for each held class
                </p>
              </div>
              <p className="text-sm font-semibold text-stone-700">
                Overall attendance: <span className="text-emerald-800">{selectedCourse.percent}%</span>
              </p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-stone-600">Analytics for this course are not available.</p>
              <button
                type="button"
                onClick={() => navigate('/teacher/analytics')}
                className="mt-3 text-sm font-semibold text-emerald-800 underline"
              >
                Back to courses
              </button>
            </div>
          )}
        </section>

        {!loading && !error && selectedCourse && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
            <div className="mb-5">
              <h3 className="font-display text-lg font-bold text-stone-900">Attendance by class</h3>
              <p className="mt-1 text-sm text-stone-500">
                Percentage of enrolled students present at each class.
              </p>
            </div>

            {selectedCourse.studentCount === 0 ? (
              <p className="py-12 text-center text-sm text-stone-500">
                No enrolled students are available for this course.
              </p>
            ) : selectedCourse.attendanceTrend.length === 0 ? (
              <p className="py-12 text-center text-sm text-stone-500">
                No classes have been held yet. Attendance analytics will appear here after the first class.
              </p>
            ) : (
              <div className="h-72 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={selectedCourse.attendanceTrend}
                    margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#78716c', fontSize: 12 }}
                      minTickGap={12}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#78716c', fontSize: 12 }}
                      width={48}
                    />
                    <Tooltip content={<AttendanceTooltip />} cursor={{ fill: '#f5f5f4' }} />
                    <Bar
                      dataKey="percent"
                      name="Attendance"
                      fill="#047857"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={56}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Analytics</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Attendance insights</h2>
        <p className="mt-1 text-sm text-stone-500">Choose a course to view its attendance graph.</p>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={retryLoad} className="font-semibold underline">Try again</button>
        </div>
      )}

      <section aria-label="Courses" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-stone-500">Loading courses...</p>
        ) : courses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-stone-500">No assigned courses are available.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {courses.map((course) => (
              <button
                key={course.courseId}
                type="button"
                onClick={() => navigate(`/teacher/analytics/${course.courseId}`)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-stone-50"
              >
                <span className="font-semibold text-stone-900">
                  {course.courseCode}: {course.courseTitle}
                </span>
                <ArrowRight size={17} className="shrink-0 text-emerald-700" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
