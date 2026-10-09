import { useEffect, useState } from 'react'
import { Check, Users } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function StudentCourseAssignments() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [studentRolls, setStudentRolls] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function loadCourses() {
      try {
        const { data } = await api.get('/admin/courses')
        setCourses(data)
        if (data.length) setSelectedCourseId(String(data[0].id))
      } catch (error) {
        setNotice(errorMessage(error, 'Could not load active courses.'))
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [])

  const selectedCourse = courses.find((course) => String(course.id) === selectedCourseId)

  const handleAddStudents = async (event) => {
    event.preventDefault()
    if (!selectedCourse || !studentRolls.trim()) return
    setSaving(true)
    setNotice('')
    try {
      const { data } = await api.put(`/admin/courses/${selectedCourse.id}/students`, {
        semester: selectedCourse.semester,
        roll_input: studentRolls,
      })
      setStudentRolls('')
      setNotice(data.added
        ? `${data.added} student(s) added to ${selectedCourse.code}.`
        : `All entered students are already assigned to ${selectedCourse.code}.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Student assignments could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-50 p-2 text-sky-700"><Users size={18} /></div>
          <h2 className="font-display text-xl font-bold text-stone-900">Assign students to a course</h2>
        </div>

        {notice && (
          <div role="status" className="mt-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            {notice}
          </div>
        )}

        {loading ? (
          <p className="mt-5 text-sm text-stone-500">Loading courses...</p>
        ) : courses.length === 0 ? (
          <p className="mt-5 text-sm text-stone-600">No active courses.</p>
        ) : (
          <form onSubmit={handleAddStudents} className="mt-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Active course</span>
              <select
                value={selectedCourseId}
                onChange={(event) => {
                  setStudentRolls('')
                  setSelectedCourseId(event.target.value)
                }}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.title} · {course.session} · {course.semester}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Student roll or range</span>
              <input
                value={studentRolls}
                onChange={(event) => setStudentRolls(event.target.value)}
                placeholder="2207001 or 2207001-2207023"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <button
              type="submit"
              disabled={saving || !studentRolls.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={16} /> {saving ? 'Adding...' : 'Add student(s) to course'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
