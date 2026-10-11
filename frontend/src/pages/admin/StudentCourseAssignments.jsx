import { useEffect, useState } from 'react'
import { Check, UploadCloud, Users, X } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function StudentCourseAssignments() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [studentRolls, setStudentRolls] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [assignmentFile, setAssignmentFile] = useState(null)
  const [uploading, setUploading] = useState(false)

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

  const handleBulkAssignment = async (event) => {
    event.preventDefault()
    if (!assignmentFile) return
    setUploading(true)
    setNotice('')
    try {
      const formData = new FormData()
      formData.append('file', assignmentFile)
      const { data } = await api.post('/admin/course-assignments/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAssignmentFile(null)
      const assigned = data.results.filter((item) => item.status === 'assigned')
      const skipped = data.results.filter((item) => item.status === 'skipped')
      setNotice(`${data.added} new assignment(s) saved across ${assigned.length} course row(s). ${skipped.length} row(s) skipped.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Course assignment spreadsheet could not be imported.'))
    } finally {
      setUploading(false)
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
          <>
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
          <div className="my-6 border-t border-stone-200 pt-6">
            <h3 className="font-display text-lg font-bold text-stone-900">Assign by Excel / CSV</h3>
            <form onSubmit={handleBulkAssignment} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative flex min-h-12 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                <UploadCloud size={17} className="text-emerald-700" />
                <span className="truncate">{assignmentFile?.name || 'Choose .xlsx or .csv file'}</span>
                <input type="file" accept=".xlsx,.csv" onChange={(event) => setAssignmentFile(event.target.files?.[0] ?? null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                {assignmentFile && <button type="button" onClick={() => setAssignmentFile(null)} className="relative z-10 ml-auto text-stone-400" aria-label="Remove assignment file"><X size={15} /></button>}
              </label>
              <button type="submit" disabled={uploading || !assignmentFile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
                <UploadCloud size={16} /> {uploading ? 'Assigning...' : 'Auto-assign students'}
              </button>
            </form>
          </div>
          </>
        )}
      </section>
    </div>
  )
}
