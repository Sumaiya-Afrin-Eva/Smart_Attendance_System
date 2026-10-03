import { BarChart3, TrendingUp, Users, Clock3 } from 'lucide-react'

const metrics = [
  { label: 'Average attendance', value: '88.4%', icon: TrendingUp },
  { label: 'Courses above threshold', value: '06 / 08', icon: BarChart3 },
  { label: 'Students at risk', value: '12', icon: Users },
  { label: 'Avg. late marks', value: '5.2%', icon: Clock3 },
]

const courses = [
  { name: 'Database Systems', percentage: 94, status: 'Strong' },
  { name: 'Operating Systems', percentage: 86, status: 'Stable' },
  { name: 'Compiler Design', percentage: 78, status: 'Monitor' },
  { name: 'Networking', percentage: 68, status: 'Follow-up' },
]

export default function TeacherAnalytics() {
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
              <p className="mt-4 font-display text-3xl font-bold text-stone-900">{metric.value}</p>
            </div>
          )
        })}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h3 className="font-display text-xl font-bold text-stone-900">Course-wise attendance trend</h3>
        <div className="mt-5 space-y-4">
          {courses.map((course) => (
            <div key={course.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-stone-800">{course.name}</span>
                <span className="text-stone-500">{course.percentage}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${course.percentage}%` }} />
              </div>
              <p className="mt-1 text-xs text-stone-500">{course.status}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
