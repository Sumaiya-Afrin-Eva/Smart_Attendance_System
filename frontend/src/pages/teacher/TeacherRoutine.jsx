import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  MapPin,
  Printer,
} from 'lucide-react'
import api from '../../lib/api'
import TeacherScheduleChangeRequests from '../../components/teacher/TeacherScheduleChangeRequests'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']

function RoutineRows({ slots }) {
  return (
    <div className="divide-y divide-stone-100">
      {slots.map((slot) => {
        const type = (slot.courseType || '').toLowerCase()
        const isLab = type.includes('lab') || type.includes('sessional')

        return (
          <div
            key={slot.id}
            className="grid gap-3 py-4 transition-colors hover:bg-emerald-50/30 md:grid-cols-[minmax(0,1fr)_minmax(180px,auto)_minmax(230px,auto)] md:items-center"
          >
            <div className="min-w-0">
              <p className="font-semibold text-stone-900">{slot.courseCode}</p>
              <p className="mt-0.5 truncate text-sm text-stone-500">
                {slot.courseTitle || 'Class Session'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isLab ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
              }`}>
                {isLab ? 'Sessional / Lab' : 'Theory'}
              </span>
              <span className="text-xs font-medium text-stone-500">
                {slot.semester || '3-1'} · Section {slot.section || 'A'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                <Clock size={14} className="shrink-0 text-emerald-700" />
                {slot.startTime} – {slot.endTime}
              </span>
              <span className="inline-flex items-center gap-1.5 text-stone-500">
                <MapPin size={13} className="shrink-0 text-stone-400" />
                {slot.room || 'TBA'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TeacherRoutine() {
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
          </div>
        </div>
      </section>

      <TeacherScheduleChangeRequests routine={routine} />

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
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white px-5 shadow-2xs">
          {DAYS.filter((dayName) => routineByDay[dayName]?.length > 0).map((dayName) => {
            const slots = routineByDay[dayName]
            return (
              <div key={dayName} className="border-b border-stone-200 last:border-b-0">
                <div className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    <h3 className="font-display text-base font-bold text-stone-900">{dayName}</h3>
                  </div>
                  <span className="text-xs font-medium text-stone-500">
                    {slots.length} {slots.length === 1 ? 'class' : 'classes'}
                  </span>
                </div>
                <RoutineRows slots={slots} />
              </div>
            )
          })}
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white px-5 shadow-2xs">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 py-4">
            <h3 className="font-display text-lg font-bold text-stone-900">{selectedDay} Schedule</h3>
            <span className="text-xs font-medium text-stone-500">
              {filteredSlots.length} {filteredSlots.length === 1 ? 'class' : 'classes'}
            </span>
          </div>

          {filteredSlots.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              No classes scheduled for {selectedDay}.
            </p>
          ) : (
            <RoutineRows slots={filteredSlots} />
          )}
        </section>
      )}
    </div>
  )
}
