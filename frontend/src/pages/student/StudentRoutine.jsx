import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  BookOpen,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  Download,
  UserCheck,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../lib/queries'
import api from '../../lib/api'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']

export default function StudentRoutine() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const [routine, setRoutine] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState('All')
  const [selectedCourse, setSelectedCourse] = useState('All')
  const [teacherSearch, setTeacherSearch] = useState('')

  useEffect(() => {
    async function loadRoutine() {
      try {
        const { data } = await api.get('/student/routine')
        setRoutine(data)
      } catch (err) {
        console.error('Failed to load student routine', err)
      } finally {
        setLoading(false)
      }
    }
    loadRoutine()
  }, [])

  const [downloading, setDownloading] = useState(false)

  // Direct File Download for Complete Weekly Routine across all days
  const handleDownloadRoutine = async () => {
    try {
      setDownloading(true)
      const res = await api.get('/student/routine/download', {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const roll = profile?.roll || 'student'
      const sem = (profile?.current_semester || 'routine').replace('-', '_')
      a.download = `class_routine_${roll}_${sem}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download routine PDF', err)
      alert('Failed to download routine PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  // Unique assigned courses from routine
  const uniqueCourseOptions = useMemo(() => {
    const map = new Map()
    routine.forEach((r) => {
      if (r.courseCode && !map.has(r.courseCode)) {
        map.set(r.courseCode, r.courseTitle || r.courseCode)
      }
    })
    return Array.from(map.entries()).map(([code, title]) => ({ code, title }))
  }, [routine])

  const cleanTeacherQuery = teacherSearch.trim().toLowerCase()

  const filteredSlots = useMemo(() => {
    return routine.filter((s) => {
      const matchDay = selectedDay === 'All' || s.day === selectedDay
      const matchCourse = selectedCourse === 'All' || s.courseCode === selectedCourse
      const matchTeacher = !cleanTeacherQuery || (s.teacherName && s.teacherName.toLowerCase().includes(cleanTeacherQuery))
      return matchDay && matchCourse && matchTeacher
    })
  }, [routine, selectedDay, selectedCourse, cleanTeacherQuery])

  const routineByDay = useMemo(() => {
    const map = {}
    DAYS.forEach((d) => (map[d] = []))
    routine.forEach((slot) => {
      const matchCourse = selectedCourse === 'All' || slot.courseCode === selectedCourse
      const matchTeacher = !cleanTeacherQuery || (slot.teacherName && slot.teacherName.toLowerCase().includes(cleanTeacherQuery))
      if (matchCourse && matchTeacher) {
        if (map[slot.day]) {
          map[slot.day].push(slot)
        } else {
          map[slot.day] = [slot]
        }
      }
    })
    return map
  }, [routine, selectedCourse, cleanTeacherQuery])

  const stats = useMemo(() => {
    const base = routine.filter((r) => {
      const matchCourse = selectedCourse === 'All' || r.courseCode === selectedCourse
      const matchTeacher = !cleanTeacherQuery || (r.teacherName && r.teacherName.toLowerCase().includes(cleanTeacherQuery))
      return matchCourse && matchTeacher
    })
    const totalPeriods = base.length
    const uniqueCourses = new Set(base.map((r) => r.courseCode)).size
    const theoryCount = base.filter((r) => (r.courseType || '').toLowerCase() === 'theory').length
    const labCount = base.filter((r) => (r.courseType || '').toLowerCase().includes('lab') || (r.courseType || '').toLowerCase().includes('sessional')).length

    return {
      totalPeriods,
      uniqueCourses,
      theoryCount,
      labCount,
    }
  }, [routine, selectedCourse, cleanTeacherQuery])

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
                Class Timetable
              </p>
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">
              My Class Routine
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Weekly class timetable for your enrolled courses according to the department master routine.
              {profile?.current_semester ? ` (Active Semester: ${profile.current_semester})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadRoutine}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 hover:text-stone-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={14} className={downloading ? 'animate-bounce' : ''} />
              {downloading ? 'Downloading...' : 'Download Routine'}
            </button>
          </div>
        </div>
      </section>

      {/* Routine Stats Bar */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Weekly Classes</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-stone-900">{stats.totalPeriods}</span>
            <span className="text-xs text-stone-500">periods / week</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Enrolled Courses</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-emerald-700">{stats.uniqueCourses}</span>
            <span className="text-xs text-stone-500">courses</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Theory Lectures</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-sky-700">{stats.theoryCount}</span>
            <span className="text-xs text-stone-500">classes</span>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Labs & Sessionals</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-amber-700">{stats.labCount}</span>
            <span className="text-xs text-stone-500">sessions</span>
          </div>
        </div>
      </section>

      {/* Filter Controls: Day Pills + Course Dropdown on Top, Full Width Search Bar Below */}
      <div className="space-y-3.5 border-b border-stone-200 pb-4">
        {/* Top Row: Day Filter Pills (Left) and Assigned Course Filter (Right) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-stone-500 mr-1">Filter Day:</span>
            {['All', ...DAYS].map((d) => {
              const count = d === 'All'
                ? filteredSlots.length
                : (routineByDay[d]?.length || 0)
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

          {/* Assigned Course Filter - Aligned directly on the right */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 whitespace-nowrap">Course:</span>
            <div className="relative">
              <select
                aria-label="Filter by assigned course"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="h-9 max-w-[260px] truncate rounded-xl border border-stone-300/80 bg-white px-3 pr-8 text-xs font-semibold text-stone-800 shadow-2xs outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
              >
                <option value="All">All Assigned Courses</option>
                {uniqueCourseOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Row: Full-width Teacher Search Bar */}
        <div className="relative flex w-full items-center">
          <div className="pointer-events-none absolute left-4 text-stone-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search by teacher name to find their classes & courses..."
            value={teacherSearch}
            onChange={(e) => setTeacherSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-stone-300/80 bg-white pl-11 pr-10 text-sm font-semibold text-stone-800 placeholder-stone-400 shadow-2xs outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />
          {teacherSearch && (
            <button
              type="button"
              onClick={() => setTeacherSearch('')}
              title="Clear teacher search"
              className="absolute right-3 flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
            >
              <X size={12} />
            </button>
          )}
        </div>
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
          <h3 className="font-display text-lg font-bold text-stone-800">No Scheduled Classes Found</h3>
          <p className="mt-1 text-xs text-stone-500 max-w-md">
            There are no routine slots matching your enrolled courses in the department master routine yet.
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
                                Sec {slot.section || 'A'} · {slot.semester}
                              </span>
                            </div>

                            <div className="mt-2">
                              <p className="text-base font-bold text-stone-900">{slot.courseCode}</p>
                              <p className="text-xs text-stone-600 line-clamp-1">{slot.courseTitle || 'Class Session'}</p>
                            </div>

                            {slot.teacherName && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                                <UserCheck size={13} className="text-emerald-700 shrink-0" />
                                <span className="truncate">{slot.teacherName}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-stone-200/60 flex items-center justify-between text-xs text-stone-600">
                            <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                              <Clock size={13} className="text-emerald-700" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                            <span className="inline-flex items-center gap-1 text-stone-500">
                              <MapPin size={12} className="text-stone-400" />
                              {slot.room && slot.room !== 'TBA' ? `Room ${slot.room}` : 'TBA'}
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
        /* Single Day View */
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
            <h3 className="font-display text-lg font-bold text-stone-900">{selectedDay} Schedule</h3>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
              {filteredSlots.length} Classes
            </span>
          </div>

          {filteredSlots.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-stone-500">No classes scheduled on {selectedDay}.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                          Sec {slot.section || 'A'} · {slot.semester}
                        </span>
                      </div>

                      <div className="mt-2">
                        <p className="text-base font-bold text-stone-900">{slot.courseCode}</p>
                        <p className="text-xs text-stone-600 line-clamp-1">{slot.courseTitle || 'Class Session'}</p>
                      </div>

                      {slot.teacherName && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                          <UserCheck size={13} className="text-emerald-700 shrink-0" />
                          <span className="truncate">{slot.teacherName}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-200/60 flex items-center justify-between text-xs text-stone-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                        <Clock size={13} className="text-emerald-700" />
                        {slot.startTime} - {slot.endTime}
                      </span>
                      <span className="inline-flex items-center gap-1 text-stone-500">
                        <MapPin size={12} className="text-stone-400" />
                        {slot.room && slot.room !== 'TBA' ? `Room ${slot.room}` : 'TBA'}
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
