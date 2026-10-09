import { useEffect, useMemo, useState } from 'react'
import { Archive, BookOpen, CalendarRange, GraduationCap, LoaderCircle, Pencil, Plus, RotateCcw, Search, Users } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const fallbackSemesters = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']

const emptyCourse = {
  code: '',
  title: '',
  department: 'CSE',
  semester: '1-1',
  course_type: 'Theory',
  credit: '3',
  session: '',
}

export default function StudentTermManagement() {
  const [departments, setDepartments] = useState([])
  const [semesters, setSemesters] = useState(fallbackSemesters)
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState(emptyCourse)
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [expandedCourseId, setExpandedCourseId] = useState(null)
  const [assignedRollsByCourse, setAssignedRollsByCourse] = useState({})
  const [loadingAssignmentsFor, setLoadingAssignmentsFor] = useState(null)
  const [assignmentError, setAssignmentError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        const [{ data: meta }, { data: courseRows }] = await Promise.all([
          api.get('/meta'),
          api.get('/admin/courses', { params: { include_archived: true } }),
        ])
        setDepartments(meta.departments ?? [])
        setSemesters(meta.semesters?.length ? meta.semesters : fallbackSemesters)
        setCourses(courseRows)
        if (meta.departments?.includes('CSE')) {
          setForm((current) => ({ ...current, department: 'CSE' }))
        } else if (meta.departments?.length) {
          setForm((current) => ({ ...current, department: meta.departments[0] }))
        }
      } catch (error) {
        setNotice(errorMessage(error, 'Could not load student course and term data.'))
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase()
    return courses.filter((course) => (includeArchived || course.is_active) && (!query ||
      `${course.code} ${course.title} ${course.department} ${course.semester} ${course.session}`
        .toLowerCase()
        .includes(query)),
    )
  }, [courses, search, includeArchived])

  const activeCourses = courses.filter((course) => course.is_active)

  const toggleAssignedStudents = async (course) => {
    if (expandedCourseId === course.id) {
      setExpandedCourseId(null)
      setAssignmentError('')
      return
    }

    setExpandedCourseId(course.id)
    setAssignmentError('')
    if (assignedRollsByCourse[course.id]) return

    setLoadingAssignmentsFor(course.id)
    try {
      const { data } = await api.get(`/admin/courses/${course.id}/students`)
      setAssignedRollsByCourse((current) => ({
        ...current,
        [course.id]: data.filter((student) => student.enrolled).map((student) => student.roll),
      }))
    } catch (error) {
      setAssignmentError(errorMessage(error, 'Assigned students could not be loaded.'))
    } finally {
      setLoadingAssignmentsFor((current) => current === course.id ? null : current)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const payload = { ...form, credit: Number(form.credit) }
      const { data } = editingCourseId
        ? await api.put(`/admin/courses/${editingCourseId}`, payload)
        : await api.post('/admin/courses', payload)
      setCourses((current) => (editingCourseId
        ? current.map((course) => course.id === data.id ? data : course)
        : [...current, data]).sort((a, b) =>
        `${a.department}${a.session}${a.semester}${a.code}`.localeCompare(
          `${b.department}${b.session}${b.semester}${b.code}`,
        ),
      ))
      setEditingCourseId(null)
      setForm((current) => ({ ...emptyCourse, department: current.department, session: current.session }))
      setNotice(`${data.code} was ${editingCourseId ? 'updated' : 'added'} for ${data.department}, session ${data.session}, term ${data.semester}.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course/term eligibility could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (course) => {
    setEditingCourseId(course.id)
    setForm({
      code: course.code,
      title: course.title,
      department: course.department,
      semester: course.semester,
      course_type: course.type,
      credit: String(course.credit),
      session: course.session,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleArchive = async (course) => {
    if (!window.confirm(`Archive ${course.code}? Its enrollments, classes, and attendance history will be kept.`)) return
    try {
      await api.delete(`/admin/courses/${course.id}`)
      setCourses((current) => current.map((item) => item.id === course.id ? { ...item, is_active: false } : item))
      setNotice(`${course.code} archived; linked history was preserved.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course could not be archived.'))
    }
  }

  const handleRestore = async (course) => {
    try {
      const { data } = await api.patch(`/admin/courses/${course.id}/restore`)
      setCourses((current) => current.map((item) => item.id === data.id ? data : item))
      setNotice(`${course.code} restored to the active course list.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course could not be restored.'))
    }
  }

  const handleArchiveAll = async () => {
    if (!activeCourses.length) return
    if (!window.confirm(`Archive all ${activeCourses.length} active courses? Existing enrollments, class sessions, and attendance history will remain in the database.`)) return
    try {
      const { data } = await api.delete('/admin/courses')
      setCourses((current) => current.map((course) => ({ ...course, is_active: false })))
      setNotice(`${data.archived} courses archived. All linked history was preserved.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Courses could not be archived.'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Student registration setup</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Courses &amp; eligible terms</h2>
        <p className="mt-3 text-sm text-stone-600">
          Students can register for a year-term only after a course is listed for their approved department and session.
          This page contains only the course details used for student eligibility.
        </p>
      </section>

      {notice && (
        <div role="status" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
          {notice}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-200">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-stone-900">{editingCourseId ? 'Edit course' : 'Add course'}</h3>
              <p className="text-sm text-stone-500">Manage offerings used for student registration and course assignments.</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Course code</span>
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="CSE 3101" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Course title</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Operating Systems" required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Department</span>
                <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Year-term</span>
                <select value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  {semesters.map((semester) => <option key={semester} value={semester}>{semester}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Academic session</span>
                <input value={form.session} onChange={(event) => setForm({ ...form, session: event.target.value })} pattern="20[0-9]{2}-20[0-9]{2}" className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="2021-2022" required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Course type</span>
                <select value={form.course_type} onChange={(event) => setForm({ ...form, course_type: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  <option value="Theory">Theory</option>
                  <option value="Lab">Lab</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Credits</span>
              <input value={form.credit} type="number" min="0.5" max="6" step="0.5" onChange={(event) => setForm({ ...form, credit: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" required />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setEditingCourseId(null); setForm((current) => ({ ...emptyCourse, department: current.department, session: current.session })) }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                <RotateCcw size={16} /> {editingCourseId ? 'Cancel edit' : 'Clear'}
              </button>
              <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Plus size={16} /> {saving ? 'Saving...' : editingCourseId ? 'Update course' : 'Save course'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-xl font-bold text-stone-900">Student-eligible courses</h3>
              <p className="mt-1 text-sm text-stone-500">{activeCourses.length} active course(s), {courses.length - activeCourses.length} archived</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search offerings" className="w-full bg-transparent text-sm outline-none sm:w-44" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIncludeArchived((value) => !value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700">
                {includeArchived ? 'Hide archived' : 'Show archived'}
              </button>
              <button type="button" onClick={handleArchiveAll} disabled={!activeCourses.length} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">
                Archive all active
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl bg-stone-50 p-6 text-sm text-stone-500">Loading offerings...</div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
              <BookOpen size={24} className="mx-auto text-stone-400" />
              <p className="mt-2 text-sm font-semibold text-stone-700">No matching course offerings</p>
              <p className="mt-1 text-xs text-stone-500">Add a course to enable the corresponding student year-term.</p>
            </div>
          ) : (
            <div className="max-h-[42rem] space-y-3 overflow-y-auto pr-1">
              {filteredCourses.map((course) => (
                <article key={course.id} className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{course.code}</p>
                      <h4 className="mt-1 truncate font-semibold text-stone-900">{course.title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      {!course.is_active && <span className="rounded-full bg-stone-200 px-2 py-1 text-[10px] font-bold uppercase text-stone-600">Archived</span>}
                      <button
                        type="button"
                        aria-label={`View assigned students for ${course.code}`}
                        title="Show assigned student rolls"
                        aria-expanded={expandedCourseId === course.id}
                        onClick={() => toggleAssignedStudents(course)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-stone-500 hover:bg-white hover:text-emerald-700"
                      >
                        <Users size={16} />
                        <span>Rolls</span>
                      </button>
                      {course.is_active && <button type="button" aria-label={`Edit ${course.code}`} onClick={() => handleEdit(course)} className="rounded-lg p-2 text-stone-500 hover:bg-white hover:text-emerald-700"><Pencil size={16} /></button>}
                      {course.is_active
                        ? <button type="button" aria-label={`Archive ${course.code}`} onClick={() => handleArchive(course)} className="rounded-lg p-2 text-stone-500 hover:bg-white hover:text-rose-700"><Archive size={16} /></button>
                        : <button type="button" aria-label={`Restore ${course.code}`} onClick={() => handleRestore(course)} className="rounded-lg p-2 text-stone-500 hover:bg-white hover:text-emerald-700"><RotateCcw size={16} /></button>}
                      <GraduationCap size={18} className="shrink-0 text-stone-400" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><CalendarRange size={12} /> {course.session}</span>
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">{course.department}</span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Year-term {course.semester}</span>
                    <span className="rounded-full bg-stone-200 px-2.5 py-1 text-stone-700">{course.type} · {course.credit} credits</span>
                  </div>
                  {expandedCourseId === course.id && (
                    <div className="mt-4 border-t border-stone-200 pt-3">
                      <h5 className="text-sm font-semibold text-stone-800">Assigned student rolls</h5>
                      {loadingAssignmentsFor === course.id ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-stone-500">
                          <LoaderCircle size={15} className="animate-spin" /> Loading assigned students...
                        </p>
                      ) : assignmentError ? (
                        <p role="alert" className="mt-2 text-sm text-rose-700">{assignmentError}</p>
                      ) : assignedRollsByCourse[course.id]?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Assigned student rolls for ${course.code}`}>
                          {assignedRollsByCourse[course.id].map((roll) => (
                            <li key={roll} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-sm font-semibold text-emerald-800">
                              {roll}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-stone-500">No students are currently assigned to this course.</p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
