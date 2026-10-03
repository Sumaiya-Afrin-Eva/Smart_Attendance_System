import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search, BookOpen, MapPin, CalendarRange, Users, GraduationCap, X, Trash2 } from 'lucide-react'
import api from '../../lib/api'

const teacherCourseOptions = [
  { code: 'CSE 3101', title: 'Database Systems' },
  { code: 'CSE 3105', title: 'Operating Systems' },
  { code: 'CSE 3207', title: 'Compiler Design' },
  { code: 'CSE 3210', title: 'Computer Networks' },
]

const initialCourses = [
  {
    id: 1,
    code: 'CSE 3101',
    title: 'Database Systems',
    semester: '3-2',
    section: 'A',
    room: 'CSE-401',
    day: 'Tuesday',
    time: '10:30 AM - 12:00 PM',
    students: 48,
    session: '2025-2026',
    rollStart: '2207001',
    rollEnd: '2207048',
  },
  {
    id: 2,
    code: 'CSE 3105',
    title: 'Operating Systems',
    semester: '3-2',
    section: 'C',
    room: 'CSE-303',
    day: 'Thursday',
    time: '09:00 AM - 10:30 AM',
    students: 46,
    session: '2025-2026',
    rollStart: '2207101',
    rollEnd: '2207146',
  },
  {
    id: 3,
    code: 'CSE 3207',
    title: 'Compiler Design',
    semester: '3-2',
    section: 'B',
    room: 'CSE-207',
    day: 'Friday',
    time: '01:00 PM - 02:30 PM',
    students: 45,
    session: '2025-2026',
    rollStart: '2207201',
    rollEnd: '2207245',
  },
]

const getWeekdayName = (dateValue) => {
  if (!dateValue) return 'Monday'

  const parsedDate = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return 'Monday'

  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsedDate)
}

const defaultForm = {
  code: '',
  title: '',
  semester: '',
  section: '',
  room: '',
  date: '',
  day: 'Monday',
  time: '',
  students: '',
  session: '',
  rollStart: '',
  rollEnd: '',
}

export default function TeacherCourses() {
  const [courses, setCourses] = useState([]) // These are actually class sessions (history)
  const [assignedCourses, setAssignedCourses] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = () => {
    if (assignedCourses.length > 0) {
      setFormData({
        ...defaultForm,
        code: assignedCourses[0].code,
        title: assignedCourses[0].title,
        semester: assignedCourses[0].semester,
        section: assignedCourses[0].section,
        session: assignedCourses[0].session,
        students: assignedCourses[0].students ? String(assignedCourses[0].students) : '',
      })
    } else {
      setFormData(defaultForm)
    }
  }

  const loadSessions = async () => {
    try {
      const { data } = await api.get('/teacher/sessions')
      setCourses(data)
    } catch (err) {
      console.error('Failed to load sessions', err)
    }
  }

  useEffect(() => {
    async function loadCourses() {
      try {
        const { data } = await api.get('/teacher/courses')
        setAssignedCourses(data)
        if (data.length > 0 && formData.code === '') {
          setFormData((prev) => ({
            ...prev,
            code: data[0].code,
            title: data[0].title,
            semester: data[0].semester,
            section: data[0].section,
            session: data[0].session,
            students: data[0].students ? String(data[0].students) : '',
          }))
        }
      } catch (err) {
        console.error('Failed to load assigned courses', err)
      }
    }
    loadCourses()
    loadSessions()
  }, [])

  const uniqueSemesters = useMemo(() => [...new Set(assignedCourses.map(c => c.semester).filter(Boolean))], [assignedCourses])
  const uniqueSessions = useMemo(() => [...new Set(assignedCourses.map(c => c.session).filter(Boolean))], [assignedCourses])
  const uniqueSections = ['A', 'B', 'Both']

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return courses

    return courses.filter((course) => {
      const searchable = `${course.code} ${course.title} ${course.section}`.toLowerCase()
      return searchable.includes(term)
    })
  }, [courses, searchTerm])

  const handleFieldChange = (event) => {
    const { name, value } = event.target

    if (name === 'date') {
      setFormData((current) => ({
        ...current,
        date: value,
        day: getWeekdayName(value),
      }))
      return
    }

    if (name === 'code') {
      const selectedCourse = assignedCourses.find((course) => course.code === value)
      setFormData((current) => ({
        ...current,
        code: selectedCourse?.code || value,
        title: selectedCourse?.title || current.title,
        semester: selectedCourse?.semester || current.semester,
        section: selectedCourse?.section || current.section,
        session: selectedCourse?.session || current.session,
        students: selectedCourse?.students ? String(selectedCourse.students) : current.students,
      }))
      return
    }

    if (name === 'title') {
      const selectedCourse = assignedCourses.find((course) => course.title === value)
      setFormData((current) => ({
        ...current,
        title: selectedCourse?.title || value,
        code: selectedCourse?.code || current.code,
        semester: selectedCourse?.semester || current.semester,
        section: selectedCourse?.section || current.section,
        session: selectedCourse?.session || current.session,
        students: selectedCourse?.students ? String(selectedCourse.students) : current.students,
      }))
      return
    }

    setFormData((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const code = formData.code.trim()
    const title = formData.title.trim()
    const room = formData.room.trim()
    const time = formData.time.trim()
    const rollStart = formData.rollStart.trim()
    const rollEnd = formData.rollEnd.trim()

    if (!code || !title || !room || !formData.date || !time) {
      return
    }

    const assignedCourse = assignedCourses.find(c => c.code === code && (c.section === formData.section || c.section === 'Both'))
    if (!assignedCourse) {
      alert("Please select a valid assigned course.")
      return
    }

    const start_at_str = `${formData.date}T${time}:00`
    const end_date = new Date(new Date(start_at_str).getTime() + 90 * 60 * 1000)
    const pad = n => n.toString().padStart(2, '0');
    const end_at_str = `${end_date.getFullYear()}-${pad(end_date.getMonth()+1)}-${pad(end_date.getDate())}T${pad(end_date.getHours())}:${pad(end_date.getMinutes())}:00`

    try {
      await api.post('/teacher/sessions', {
        course_id: assignedCourse.id,
        start_at: start_at_str,
        end_at: end_at_str,
        room,
        students: Number(formData.students) || 0,
        roll_start: rollStart,
        roll_end: rollEnd
      })
      await loadSessions()
      resetForm()
      setIsModalOpen(false)
    } catch (err) {
      console.error('Failed to create session', err)
      alert("Failed to create class session")
    }
  }

  const openDeleteModal = (course) => {
    setCourseToDelete(course)
    setIsDeleteModalOpen(true)
  }

  const handleDeleteCourse = async () => {
    if (!courseToDelete) return

    try {
      await api.delete(`/teacher/sessions/${courseToDelete.id}`)
      await loadSessions()
    } catch (err) {
      console.error("Failed to delete session", err)
      alert("Failed to delete class session")
    }

    setIsDeleteModalOpen(false)
    setCourseToDelete(null)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty workspace</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Manage Class Sessions</h2>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
          >
            <Plus size={16} />
            Create new class
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by course title, code, section..."
              className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-10 pr-3 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
          <div className="flex gap-2 text-xs font-medium text-stone-600">
            <button className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 hover:bg-stone-100 cursor-pointer">Current</button>
            <button className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 hover:bg-stone-100 cursor-pointer">History</button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredCourses.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-2xs">
            <BookOpen className="text-stone-300 mb-2" size={32} />
            <span className="text-stone-500 font-medium">No class sessions scheduled</span>
          </div>
        ) : filteredCourses.map((course) => (
          <article key={course.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{course.code}</p>
                <h3 className="mt-2 font-display text-2xl font-bold text-stone-900">{course.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">{course.semester}</span>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">Section {course.section}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{course.session}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center gap-2 text-stone-500"><CalendarRange size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Schedule</span></div>
                <p className="mt-2 text-sm font-semibold text-stone-900">{course.day}</p>
                <p className="text-sm text-stone-600">{course.time}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center gap-2 text-stone-500"><MapPin size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Room</span></div>
                <p className="mt-2 text-sm font-semibold text-stone-900">{course.room}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center gap-2 text-stone-500"><Users size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Students</span></div>
                <p className="mt-2 text-sm font-semibold text-stone-900">{course.students || 0} total</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center gap-2 text-stone-500"><GraduationCap size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Roll range</span></div>
                <p className="mt-2 text-sm font-semibold text-stone-900">{course.rollStart || '—'} - {course.rollEnd || '—'}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">Open class</button>
              <button className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">Attendance report</button>
              <button className="rounded-xl bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer">Mark attendance</button>
              <button
                type="button"
                onClick={() => openDeleteModal(course)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>

      {isDeleteModalOpen && courseToDelete && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl -translate-y-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Delete class</p>
                <h3 className="mt-2 font-display text-2xl font-bold text-stone-900">Confirm removal</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false)
                  setCourseToDelete(null)
                }}
                className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-500 transition hover:bg-stone-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-stone-600">
              Are you sure you want to delete <span className="font-semibold text-stone-900">{courseToDelete.code}</span> - <span className="font-semibold text-stone-900">{courseToDelete.title}</span>? This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false)
                  setCourseToDelete(null)
                }}
                className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCourse}
                className="rounded-xl border border-rose-200 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 cursor-pointer"
              >
                Delete class
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/35 p-4">
          <div className="flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">New class</p>
                <h3 className="mt-1 font-display text-2xl font-bold text-stone-900">Create class session</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-500 transition hover:bg-stone-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
              <div className="overflow-y-auto p-5">
                <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Course code</span>
                  <select
                    name="code"
                    value={formData.code}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  >
                    {assignedCourses.map((course) => (
                      <option key={course.id + '-code'} value={course.code}>{course.code}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Course title</span>
                  <select
                    name="title"
                    value={formData.title}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  >
                    {assignedCourses.map((course) => (
                      <option key={course.id + '-title'} value={course.title}>{course.title}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Semester</span>
                  <select
                    name="semester"
                    value={formData.semester}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                  >
                    {uniqueSemesters.map((semester) => (
                      <option key={semester} value={semester}>{semester}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Section</span>
                  <select
                    name="section"
                    value={formData.section}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                  >
                    {uniqueSections.map((sec) => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Room no</span>
                  <input
                    type="text"
                    name="room"
                    value={formData.room}
                    onChange={handleFieldChange}
                    placeholder="CSE-401"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Session</span>
                  <select
                    name="session"
                    value={formData.session}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                  >
                    {uniqueSessions.map((session) => (
                      <option key={session} value={session}>{session}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Date</span>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Day</span>
                  <input
                    type="text"
                    name="day"
                    value={formData.day}
                    readOnly
                    className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-sm text-stone-700 outline-none"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Time</span>
                  <input
                    type="time"
                    name="time"
                    value={formData.time}
                    onChange={handleFieldChange}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>No. of total students</span>
                  <input
                    type="number"
                    name="students"
                    value={formData.students}
                    onChange={handleFieldChange}
                    min="1"
                    placeholder="48"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Roll start</span>
                  <input
                    type="text"
                    name="rollStart"
                    value={formData.rollStart}
                    onChange={handleFieldChange}
                    placeholder="2207001"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-stone-700">
                  <span>Roll end</span>
                  <input
                    type="text"
                    name="rollEnd"
                    value={formData.rollEnd}
                    onChange={handleFieldChange}
                    placeholder="2207048"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                    required
                  />
                </label>
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-stone-200 p-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  Save class
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
