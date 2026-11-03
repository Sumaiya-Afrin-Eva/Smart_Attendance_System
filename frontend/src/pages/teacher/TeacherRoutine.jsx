import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  BookOpen,
  MapPin,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  Printer,
  ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../lib/api'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']

export default function TeacherRoutine() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [routine, setRoutine] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState('All')

  useEffect(() => {
    async function loadRoutine() {
      try {
        const { data } = await api.get('/teacher/routine')
        setRoutine(data)
      } catch (err) {
        console.error('Failed to load teacher routine', err)
      } finally {
        setLoading(false)
      }
    }
    loadRoutine()
  }, [])

  const filteredSlots = useMemo(() => {
    if (selectedDay === 'All') return routine
    return routine.filter((s) => s.day === selectedDay)
  }, [routine, selectedDay])

  const routineByDay = useMemo(() => {
    const map = {}
    DAYS.forEach((d) => (map[d] = []))
    routine.forEach((slot) => {
      if (map[slot.day]) {
        map[slot.day].push(slot)
      } else {
        map[slot.day] = [slot]
      }
    })
    return map
  }, [routine])

  const stats = useMemo(() => {
    const totalPeriods = routine.length
    const uniqueCourses = new Set(routine.map((r) => r.courseCode)).size
    const theoryCount = routine.filter((r) => (r.courseType || '').toLowerCase() === 'theory').length
    const labCount = routine.filter((r) => (r.courseType || '').toLowerCase().includes('lab') || (r.courseType || '').toLowerCase().includes('sessional')).length

    return {
      totalPeriods,
      uniqueCourses,
      theoryCount,
      labCount,
    }
  }, [routine])

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <CalendarDays size={16} />
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                Faculty Schedule
              </p>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">
              Weekly Class Routine & Timetable
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Your scheduled lecture periods and sessional lab slots configured by the department.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <Printer size={14} />
              Print Routine
            </button>
            <button
              onClick={() => navigate('/teacher/courses')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={14} />
              Manage Sessions
            </button>
          </div>
        </div>
      </section>

      {/* Routine Stats Bar */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Weekly Load</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-stone-900">{stats.totalPeriods}</span>
            <span className="text-xs text-stone-500">periods / week</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Assigned Courses</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-emerald-700">{stats.uniqueCourses}</span>
            <span className="text-xs text-stone-500">subjects</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Theory Periods</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-sky-700">{stats.theoryCount}</span>
            <span className="text-xs text-stone-500">lectures</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Sessional / Labs</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-amber-700">{stats.labCount}</span>
            <span className="text-xs text-stone-500">sessions</span>
          </div>
        </div>
      </section>

      {/* Day Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
        <span className="text-xs font-bold text-stone-500 mr-1">Filter Day:</span>
        {['All', ...DAYS].map((d) => {
          const count = d === 'All' ? routine.length : (routineByDay[d]?.length || 0)
          const active = selectedDay === d
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{d}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  active ? 'bg-emerald-950 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Routine Content */}
      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-2xs">
          <span className="text-sm font-medium text-stone-500">Loading your timetable...</span>
        </div>
      ) : routine.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 mb-3">
            <CalendarDays size={24} />
          </div>
          <h3 className="font-display text-lg font-bold text-stone-800">No Routine Slots Assigned Yet</h3>
          <p className="mt-1 text-xs text-stone-500 max-w-md">
            Once the department administrator uploads the central routine spreadsheet, your weekly classes will automatically appear here.
          </p>
        </div>
      ) : selectedDay === 'All' ? (
        /* Full Weekly Overview grouped by Day */
        <div className="space-y-6">
          {DAYS.map((dayName) => {
            const slots = routineByDay[dayName] || []
            return (
              <div key={dayName} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 rounded-full bg-emerald-600" />
                    <h3 className="font-display text-lg font-bold text-stone-900">{dayName}</h3>
                  </div>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
                    {slots.length} {slots.length === 1 ? 'Period' : 'Periods'}
                  </span>
                </div>

                {slots.length === 0 ? (
                  <p className="py-4 text-center text-xs text-stone-400 italic">
                    No classes scheduled for {dayName}.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {slots.map((slot) => {
                      const isLab = (slot.courseType || '').toLowerCase().includes('lab') || (slot.courseType || '').toLowerCase().includes('sessional')
                      return (
                        <div
                          key={slot.id}
                          className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/70 p-4 transition hover:bg-stone-100 hover:border-emerald-300 shadow-2xs"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                  isLab
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isLab ? 'Sessional / Lab' : 'Theory'}
                              </span>
                              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                                Term {slot.semester || '3-1'} · Sec {slot.section || 'A'}
                              </span>
                            </div>

                            <div className="mt-2">
                              <p className="text-base font-bold text-stone-900">{slot.courseCode}</p>
                              <p className="text-xs text-stone-600 line-clamp-1">{slot.courseTitle || 'Class Session'}</p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-stone-200/60 flex items-center justify-between text-xs text-stone-600">
                            <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                              <Clock size={13} className="text-emerald-700" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                            <span className="inline-flex items-center gap-1 text-stone-500">
                              <MapPin size={12} className="text-stone-400" />
                              {slot.room || 'TBA'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Single Day Selected */
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
            <h3 className="font-display text-lg font-bold text-stone-900">{selectedDay} Schedule</h3>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
              {filteredSlots.length} {filteredSlots.length === 1 ? 'Period' : 'Periods'}
            </span>
          </div>

          {filteredSlots.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400 italic">
              No classes scheduled for {selectedDay}.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSlots.map((slot) => {
                const isLab = (slot.courseType || '').toLowerCase().includes('lab') || (slot.courseType || '').toLowerCase().includes('sessional')
                return (
                  <div
                    key={slot.id}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/70 p-4 transition hover:bg-stone-100 hover:border-emerald-300 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            isLab
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isLab ? 'Sessional / Lab' : 'Theory'}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                          Term {slot.semester || '3-1'} · Sec {slot.section || 'A'}
                        </span>
                      </div>

                      <div className="mt-2">
                        <p className="text-base font-bold text-stone-900">{slot.courseCode}</p>
                        <p className="text-xs text-stone-600">{slot.courseTitle || 'Class Session'}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-200/60 flex items-center justify-between text-xs text-stone-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                        <Clock size={13} className="text-emerald-700" />
                        {slot.startTime} - {slot.endTime}
                      </span>
                      <span className="inline-flex items-center gap-1 text-stone-500">
                        <MapPin size={12} className="text-stone-400" />
                        {slot.room || 'TBA'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
