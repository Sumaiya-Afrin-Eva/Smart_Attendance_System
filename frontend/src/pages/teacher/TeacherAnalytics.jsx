import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, CalendarDays } from 'lucide-react'
import api from '../../lib/api'

export default function TeacherAnalytics() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const { data } = await api.get('/teacher/stats')
        setStats(data)
      } catch (err) {
        console.error('Failed to load teacher stats', err)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  const metrics = [
    { label: 'Average attendance', value: stats?.avg_attendance || '0%', icon: TrendingUp },
    { label: 'Active assigned courses', value: stats?.active_courses || '0', icon: BarChart3 },
    { label: 'Students tracked', value: stats?.students_tracked || '0', icon: Users },
    { label: 'Total class sessions', value: stats?.total_classes || '0', icon: CalendarDays },
  ]

  const performanceCourses = stats?.performance || []

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Analytics</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Attendance insights</h2>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <div key={metric.label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone-500">{metric.label}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Icon size={18} />
                </div>
              </div>
              <p className="mt-4 font-display text-3xl font-bold text-stone-900">
                {loading ? '...' : metric.value}
              </p>
            </div>
          )
        })}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h3 className="font-display text-xl font-bold text-stone-900">Course-wise attendance trend</h3>
        <div className="mt-5 space-y-4">
          {loading ? (
            <p className="p-6 text-center text-sm text-stone-500">Loading course trends...</p>
          ) : performanceCourses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center text-sm text-stone-500">
              No class attendance recorded yet. Once attendance is scanned, course insights will appear here.
            </p>
          ) : (
            performanceCourses.map((course) => (
              <div key={course.course}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-stone-800">{course.course}</span>
                  <span className="text-stone-500">{course.percent}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${course.percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-500">{course.status}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
