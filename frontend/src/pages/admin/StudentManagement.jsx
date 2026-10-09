import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const semesters = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']

export default function StudentManagement() {
  const navigate = useNavigate()
  const location = useLocation()
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
  const [semester, setSemester] = useState('All')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(() => location.state?.notice ?? '')

  useEffect(() => {
    async function loadStudents() {
      try {
        const { data } = await api.get('/admin/students')
        setStudents(data)
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load students.'))
      } finally {
        setLoading(false)
      }
    }
    loadStudents()
  }, [])

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesSearch = `${student.name} ${student.roll}`.toLowerCase().includes(search.toLowerCase())
      const matchesDepartment = department === 'All' || student.department === department
      const matchesSemester = semester === 'All' || student.semester === semester
      return matchesSearch && matchesDepartment && matchesSemester
    })
  }, [students, search, department, semester])

  const editStudent = (student) => {
    if (!student.id) return
    navigate(`/admin/students/${student.id}/edit`)
  }

  const deleteStudent = async (student) => {
    const isLegacyStudent = !student.id && student.user_id
    const message = isLegacyStudent
      ? `Permanently delete ${student.name}'s legacy account, profile, enrollments, and face samples? This cannot be undone.`
      : `Remove the roster record for ${student.name}? Registered accounts will be disabled, not erased.`
    if ((!student.id && !isLegacyStudent) || !window.confirm(message)) return
    try {
      const { data } = isLegacyStudent
        ? await api.delete(`/admin/legacy-students/${student.user_id}`)
        : await api.delete(`/admin/students/${student.id}`)
      const refreshed = await api.get('/admin/students')
      setStudents(refreshed.data)
      setNotice(isLegacyStudent
        ? `${student.name}'s legacy account and associated student data were deleted.`
        : data.disabled
        ? `${student.name}'s record and account were disabled.`
        : `${student.name}'s roster record was deleted.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Student record could not be removed.'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Student records</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Student management</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/students/new')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={16} /> Add student
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          Students can select a year-term only when it is configured under Student Courses &amp; Terms for the same department and session.
          Saving an active roster record enables its KUET email for sign-in and registration. The official photo is used by the attendance kiosk.
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Academic directory</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">Students</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search name or roll" className="w-48 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
              <option value="All">All departments</option>
              <option value="CSE">CSE</option>
              <option value="EEE">EEE</option>
              <option value="ECE">ECE</option>
              <option value="ME">ME</option>
            </select>
            <select value={semester} onChange={(event) => setSemester(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
              <option value="All">All semesters</option>
              {semesters.map((term) => <option key={term} value={term}>{term}</option>)}
            </select>
          </div>

          {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

          <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
            {loading ? (
              <div className="bg-white p-6 text-sm text-stone-500">Loading students...</div>
            ) : (
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Roll</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Semester</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredStudents.map((student) => (
                  <tr key={student.id ?? `user-${student.user_id}`} className="hover:bg-stone-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-sm font-bold text-teal-800">
                          {student.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-stone-900">{student.name}</p>
                          <p className="text-xs text-stone-500">{student.session} · {student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-700">{student.roll}</td>
                    <td className="px-4 py-3 text-stone-700">{student.department}</td>
                    <td className="px-4 py-3 text-stone-700">{student.semester || 'Not registered'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {student.id && (
                          <>
                            <button type="button" onClick={() => editStudent(student)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50">Edit</button>
                          </>
                        )}
                        {(student.id || student.user_id) && (
                          <button type="button" onClick={() => deleteStudent(student)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
      </section>
    </div>
  )
}
