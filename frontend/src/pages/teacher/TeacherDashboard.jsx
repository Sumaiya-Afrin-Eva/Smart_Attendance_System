import { BookOpen, CalendarDays, ChartColumnBig, Clock3, GraduationCap, Users, FileText, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

import { useState, useEffect } from 'react'
import api from '../../lib/api'

const baseStats = [
  { id: 'active_courses', label: 'Active courses', hint: 'Across current semester', icon: BookOpen, tone: 'emerald' },
  { id: 'total_classes', label: 'Total classes', hint: 'This term so far', icon: CalendarDays, tone: 'sky' },
  { id: 'students_tracked', label: 'Students tracked', hint: 'Across all sections', icon: Users, tone: 'amber' },
  { id: 'avg_attendance', label: 'Avg. attendance', hint: 'Department benchmark', icon: ChartColumnBig, tone: 'violet' },
]



function StatCard({ item }) {
  const Icon = item.icon
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{item.label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-stone-900">{item.value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneMap[item.tone]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="mt-3 text-xs text-stone-500">{item.hint}</p>
    </div>
  )
}

export default function TeacherDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(baseStats.map(s => ({ ...s, value: '...' })))
  const [upcoming, setUpcoming] = useState([])
  const [performance, setPerformance] = useState([])
  const [recent, setRecent] = useState([])

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data } = await api.get('/teacher/stats')
        setStats(baseStats.map(s => ({ ...s, value: data[s.id] })))
        if (data.upcoming) setUpcoming(data.upcoming)
        if (data.performance) setPerformance(data.performance)
        if (data.recent) setRecent(data.recent)
      } catch (err) {
        console.error('Failed to load stats', err)
        setStats(baseStats.map(s => ({ ...s, value: '-' })))
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty overview</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Welcome, {user?.name || 'Faculty'}</h2>
            <p className="mt-1 text-sm text-stone-500">Your classes, attendance trends, and student engagement are all in sync.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer">
            <CalendarDays size={16} />
            Create class session
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => <StatCard key={item.label} item={item} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-stone-900">Upcoming classes</h3>
            <button className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer">
              View all <ArrowRight size={15} />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {upcoming.map((item) => (
              <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50/80 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{item.course}</p>
                    <h4 className="mt-1 text-base font-semibold text-stone-900">{item.title}</h4>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    {item.section}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-600">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={14} className="text-stone-400" /> {item.time}</span>
                  <span className="inline-flex items-center gap-1.5"><BookOpen size={14} className="text-stone-400" /> Room {item.room}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-stone-900">Class health</h3>
            <button className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer">Details</button>
          </div>

          <div className="mt-5 space-y-4">
            {performance.map((item) => (
              <div key={item.course}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-stone-800">{item.course}</span>
                  <span className="text-stone-500">{item.percent}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${item.percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-500">{item.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-stone-900">Recent class records</h3>
            <button className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer">Open history</button>
          </div>

          <div className="mt-5 space-y-3">
            {recent.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3.5">
                <div>
                  <p className="font-semibold text-stone-800">{item.class}</p>
                  <p className="text-xs text-stone-500">{item.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-700">{item.score}</p>
                  <p className="text-xs text-stone-500">{item.students}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-stone-900">Quick actions</h3>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 cursor-pointer">
              <GraduationCap size={18} className="text-emerald-700" />
              <p className="mt-3 font-semibold text-stone-900">Create new class</p>
              <p className="mt-1 text-xs text-stone-500">Add course, room, timetable and student list.</p>
            </button>
            <button className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 cursor-pointer">
              <Users size={18} className="text-emerald-700" />
              <p className="mt-3 font-semibold text-stone-900">Manage roster</p>
              <p className="mt-1 text-xs text-stone-500">Review roll range, sections, and batch allocation.</p>
            </button>
            <button className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 cursor-pointer">
              <FileText size={18} className="text-emerald-700" />
              <p className="mt-3 font-semibold text-stone-900">View history</p>
              <p className="mt-1 text-xs text-stone-500">Access earlier sessions and student attendance logs.</p>
            </button>
            <button className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 cursor-pointer">
              <ChartColumnBig size={18} className="text-emerald-700" />
              <p className="mt-3 font-semibold text-stone-900">Analytics</p>
              <p className="mt-1 text-xs text-stone-500">Track attendance percentage and class trend.</p>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
