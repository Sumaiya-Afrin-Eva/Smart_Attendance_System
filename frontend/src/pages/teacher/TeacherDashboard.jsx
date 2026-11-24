import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { errorMessage } from '../../lib/api'

const EMPTY_DASHBOARD = {
  active_courses: '0',
  total_classes: '0',
  students_tracked: '0',
  upcoming: [],
}

function MetricCard({ label, value, note, icon: Icon, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  }

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-stone-900">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
      <p className="mt-3 text-xs text-stone-500">{note}</p>
    </article>
  )
}

function EmptyState({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-8 text-center text-sm text-stone-500">
      {children}
    </div>
  )
}

export default function TeacherDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/teacher/stats')
        if (!cancelled) setDashboard(data)
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, 'Could not load your dashboard.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => { cancelled = true }
  }, [reloadKey])

  const data = dashboard || EMPTY_DASHBOARD
  const metrics = [
    { label: 'Assigned courses', value: data.active_courses, note: 'Courses assigned to you', icon: BookOpen, tone: 'emerald' },
    { label: 'Classes held', value: data.total_classes, note: 'Class sessions recorded', icon: CalendarDays, tone: 'blue' },
    { label: 'Students enrolled', value: data.students_tracked, note: 'Across your assigned courses', icon: Users, tone: 'amber' },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Teacher dashboard</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
              Welcome, {user?.name || 'Teacher'}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-stone-500">
              Review your upcoming classes and assigned courses.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/teacher/routine')}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <CalendarDays size={16} />
              View routine
            </button>
            <button
              type="button"
              onClick={() => navigate('/teacher/history')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <BookOpen size={16} />
              Class history
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="font-bold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <section aria-label="Teaching summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            {...metric}
            value={loading ? '—' : metric.value}
          />
        ))}
      </section>

      <section aria-label="Upcoming classes">
        <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-stone-900">Upcoming classes</h3>
              <p className="mt-1 text-sm text-stone-500">Your next scheduled teaching slots</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/teacher/routine')}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Full routine <ArrowRight size={15} />
            </button>
          </div>

          {loading ? (
            <EmptyState>Loading your schedule…</EmptyState>
          ) : data.upcoming?.length ? (
            <div className="space-y-3">
              {data.upcoming.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-stone-100 bg-stone-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-stone-900">{item.course}</p>
                    <p className="mt-0.5 truncate text-sm text-stone-600">{item.title}</p>
                    <p className="mt-1 text-xs text-stone-500">{item.section}</p>
                  </div>
                  <div className="shrink-0 space-y-1 text-sm text-stone-600 sm:text-right">
                    <p className="inline-flex items-center gap-1.5 sm:justify-end">
                      <CalendarDays size={14} className="text-emerald-700" />
                      {item.date}
                    </p>
                    <p className="inline-flex items-center gap-1.5 sm:justify-end">
                      <Clock3 size={14} className="text-emerald-700" />
                      {item.time}
                    </p>
                    <p className="text-xs text-stone-500">Room {item.room || 'TBA'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>
              No classes found. Check your routine or ask the department admin to assign your schedule.
            </EmptyState>
          )}
        </article>
      </section>
    </div>
  )
}
