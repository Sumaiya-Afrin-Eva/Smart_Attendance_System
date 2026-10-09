import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarRange,
  Check,
  Filter,
  GraduationCap,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Users,
  Clock3,
  X,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const semesterOptions = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']

const emptyCourseForm = {
  code: '',
  title: '',
  department: 'CSE',
  semester: '1-1',
  course_type: 'Theory',
  credit: '3',
  session: '2025-2026',
}

export default function AdminCourses() {
  const [meta, setMeta] = useState({ departments: [], semesters: [] })
  const [courses, setCourses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyCourseForm)
  const [studentFilter, setStudentFilter] = useState({ department: 'CSE', semester: '3-2', section: '', q: '' })
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedSection, setSelectedSection] = useState('A')
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAssignment, setSavedAssignment] = useState(false)
  const [notice, setNotice] = useState('')

  const summary = useMemo(() => [
    { label: 'Total courses', value: String(courses.length), tone: 'emerald' },
    { label: 'Teachers', value: String(teachers.length), tone: 'sky' },
    { label: 'Departments', value: String(new Set(courses.map((course) => course.department)).size), tone: 'amber' },
    { label: 'Semesters', value: String(new Set(courses.map((course) => course.semester)).size), tone: 'violet' },
  ], [courses, teachers])

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return courses
    return courses.filter((course) => {
      const haystack = `${course.code} ${course.title} ${course.teacher_name ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [courses, search])

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId)) || null

  useEffect(() => {
    async function loadMetaAndCourses() {
      try {
        const [{ data: metaData }, { data: courseData }, { data: teacherData }] = await Promise.all([
          api.get('/meta'),
          api.get('/admin/courses'),
          api.get('/admin/teachers'),
        ])
        setMeta(metaData)
        setCourses(courseData)
        setTeachers(teacherData)
        if (courseData.length) {
          setSelectedCourseId(String(courseData[0].id))
          setSelectedTeacherId(courseData[0].teacher_id ? String(courseData[0].teacher_id) : '')
        }
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load course data.'))
      } finally {
        setLoading(false)
      }
    }
    loadMetaAndCourses()
  }, [])

  useEffect(() => {
    async function loadStudents() {
      try {
        const { data } = await api.get('/admin/students', {
          params: {
            department: studentFilter.department || undefined,
            semester: studentFilter.semester || undefined,
            session: selectedCourse?.session || undefined,
            section: studentFilter.section || undefined,
            q: studentFilter.q || undefined,
          },
        })
        const registered = data.filter((student) => student.user_id)
        setStudents(registered)
        setSelectedStudentIds((current) => current.filter((id) => registered.some((student) => String(student.user_id) === String(id))))
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load student list.'))
      }
    }
    loadStudents()
  }, [studentFilter, selectedCourseId, selectedCourse?.session])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const payload = {
        ...form,
        credit: Number(form.credit),
      }
      const { data } = await api.post('/admin/courses', payload)
      setCourses((current) => [data, ...current])
      setForm(emptyCourseForm)
      setSelectedCourseId(String(data.id))
      setNotice(`Course ${data.code} saved to the database.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  const handleTeacherAssignment = async () => {
    if (!selectedCourseId) return
    setNotice('')
    try {
      const { data } = await api.patch(`/admin/courses/${selectedCourseId}/teacher`, {
        teacher_id: selectedTeacherId ? Number(selectedTeacherId) : null,
        section: selectedSection,
      })
      setCourses((current) => current.map((course) => String(course.id) === String(data.id) ? data : course))
      
      setSavedAssignment(true)
      setTimeout(() => {
        setSavedAssignment(false)
        setSelectedCourseId('')
        setSelectedTeacherId('')
        setSelectedSection('A')
      }, 2000)
    } catch (error) {
      setNotice(errorMessage(error, 'Teacher assignment failed.'))
    }
  }

  const handleEnrollStudents = async () => {
    if (!selectedCourseId || selectedStudentIds.length === 0) return
    setNotice('')
    try {
      const course = courses.find((item) => String(item.id) === String(selectedCourseId))
      const { data } = await api.post('/admin/student-enrollments', {
        course_id: Number(selectedCourseId),
        semester: course?.semester || studentFilter.semester,
        student_ids: selectedStudentIds.map((id) => Number(id)),
      })
      setNotice(`${data.saved} students enrolled in ${course?.code ?? 'this course'}.`)
      setSelectedStudentIds([])
    } catch (error) {
      setNotice(errorMessage(error, 'Student enrollment failed.'))
    }
  }

  const handleRemoveCourse = async (id, code) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${code}? This will remove all enrollments and class sessions associated with it.`)) return
    setNotice('')
    try {
      await api.delete(`/admin/courses/${id}`)
      setCourses((current) => current.filter((course) => String(course.id) !== String(id)))
      if (String(selectedCourseId) === String(id)) {
        setSelectedCourseId('')
      }
      setNotice(`Course ${code} permanently deleted.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course deletion failed.'))
    }
  }

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    )
  }

  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Academic control</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Course management</h2>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ label, value, tone }) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${toneClass[tone]}`}>
                <BookOpen size={18} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl font-bold text-stone-900">Add new course</h3>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <Plus size={14} /> Database-backed
            </span>
          </div>

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Course code</span>
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="CSE 3101" required />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Credit</span>
              <input value={form.credit} type="number" min="0.5" max="6.0" step="0.5" onChange={(event) => setForm({ ...form, credit: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" required />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Course title</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Operating Systems" required />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Department</span>
              <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                {meta.departments.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Semester</span>
              <select value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                {(meta.semesters.length ? meta.semesters : semesterOptions).map((semester) => (
                  <option key={semester} value={semester}>{semester}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Type</span>
              <select value={form.course_type} onChange={(event) => setForm({ ...form, course_type: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                <option value="Theory">Theory</option>
                <option value="Lab">Lab</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Session</span>
              <input value={form.session} onChange={(event) => setForm({ ...form, session: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="2025-2026" required />
            </label>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setForm(emptyCourseForm)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                <RotateCcw size={16} /> Clear form
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70">
                <Plus size={16} />
                {saving ? 'Saving...' : 'Save course'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-bold text-stone-900">Assignments</h3>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 ring-1 ring-sky-200">Live</span>
          </div>

          <div className="space-y-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Course</span>
              <select value={selectedCourseId} onChange={(event) => {
                const value = event.target.value
                setSelectedCourseId(value)
                const course = courses.find((item) => String(item.id) === String(value))
                setSelectedTeacherId(course?.teacher_id ? String(course.teacher_id) : '')
              }} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                {courses.length === 0 ? <option value="">No courses yet</option> : courses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.title}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Section</span>
              <select value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="Both">Both</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Teacher</span>
              <select value={selectedTeacherId} onChange={(event) => setSelectedTeacherId(event.target.value)} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                <option value="">Unassign</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
            </label>

            <button onClick={handleTeacherAssignment} className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 ${savedAssignment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-stone-900 hover:bg-stone-700'}`}>
              <Check size={16} /> {savedAssignment ? 'Saved!' : 'Save teacher assignment'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-stone-900">Student enrollment</h3>
            <p className="mt-1 text-sm text-stone-500">Assign eligible students to a course by department, semester and term.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-stone-600">
            <Search size={16} />
            <input value={studentFilter.q} onChange={(event) => setStudentFilter((current) => ({ ...current, q: event.target.value }))} type="text" placeholder="Search roll / student" className="w-52 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400" />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <select value={studentFilter.department} onChange={(event) => setStudentFilter((current) => ({ ...current, department: event.target.value }))} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
            {meta.departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select value={studentFilter.semester} onChange={(event) => setStudentFilter((current) => ({ ...current, semester: event.target.value }))} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
            {(meta.semesters.length ? meta.semesters : semesterOptions).map((semester) => (
              <option key={semester} value={semester}>{semester}</option>
            ))}
          </select>
          <select value={studentFilter.section} onChange={(event) => setStudentFilter((current) => ({ ...current, section: event.target.value }))} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
            <option value="">All sections</option>
            {['A', 'B', 'C', 'D'].map((section) => <option key={section} value={section}>{section}</option>)}
          </select>
          <button onClick={handleEnrollStudents} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={selectedStudentIds.length === 0 || !selectedCourseId}>
            <Check size={16} /> Enroll selected
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200">
          <div className="grid gap-px bg-stone-200 md:grid-cols-6">
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Select</div>
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Roll</div>
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Name</div>
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Department</div>
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Semester</div>
            <div className="bg-stone-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">Section</div>
          </div>
          {students.length === 0 ? (
            <div className="bg-white p-6 text-sm text-stone-500">No students matched these filters.</div>
          ) : (
            students.map((student) => (
              <div key={student.user_id} className="grid gap-px bg-stone-200 md:grid-cols-6">
                <div className="bg-white px-4 py-3">
                  <input type="checkbox" checked={selectedStudentIds.includes(student.user_id)} onChange={() => toggleStudent(student.user_id)} className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-500" />
                </div>
                <div className="bg-white px-4 py-3 text-sm font-semibold text-stone-900">{student.roll}</div>
                <div className="bg-white px-4 py-3 text-sm text-stone-900">{student.full_name}</div>
                <div className="bg-white px-4 py-3 text-sm text-stone-700">{student.department}</div>
                <div className="bg-white px-4 py-3 text-sm text-stone-700">{student.current_semester}</div>
                <div className="bg-white px-4 py-3 text-sm text-stone-700">{student.section ?? '—'}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-stone-600">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search course code, title or teacher..." className="w-full bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              <Filter size={15} /> Department
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
              <CalendarRange size={15} /> Semester
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">Loading courses...</div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">No courses matched your search.</div>
          ) : (
            filteredCourses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-stone-200 bg-[#fcfbfa] p-4 shadow-2xs">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{course.code}</p>
                    <h3 className="mt-2 font-display text-2xl font-bold text-stone-900">{course.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">{course.semester}</span>
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700 ring-1 ring-sky-200">{course.type}</span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-amber-200">{course.department}</span>
                      <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700 ring-1 ring-purple-200">Sec {course.section}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start xl:self-center">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Active</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 text-stone-500"><GraduationCap size={15} /> <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Teacher</span></div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{course.teacher_name || 'Unassigned'}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 text-stone-500"><Users size={15} /> <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Credits</span></div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{course.credit} credits</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 text-stone-500"><CalendarRange size={15} /> <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Semester</span></div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{course.semester}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 text-stone-500"><MapPin size={15} /> <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Department</span></div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{course.department}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 text-stone-500"><Clock3 size={15} /> <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Type</span></div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{course.type}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedCourseId(String(course.id))} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                    <BookOpen size={14} /> Select
                  </button>
                  <button type="button" onClick={() => handleRemoveCourse(course.id, course.code)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer">
                    <X size={14} /> Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      )}
    </div>
  )
}
