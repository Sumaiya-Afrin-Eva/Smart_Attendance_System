import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  ImagePlus,
  Mail,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const statusColors = {
  Verified: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Review: 'bg-amber-50 text-amber-700 ring-amber-200',
  Suspended: 'bg-rose-50 text-rose-700 ring-rose-200',
  Pending: 'bg-sky-50 text-sky-700 ring-sky-200',
}

const DEPARTMENTS = ["CSE", "EEE", "ECE", "ME", "CE", "IEM", "BME", "MSE", "URP", "ARCH", "BECM", "LE", "TE", "ChE", "MTE", "PHY", "CHEM", "MATH", "HUM"];


const riskColors = {
  Low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  High: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export default function StudentManagement() {
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
  const [semester, setSemester] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [form, setForm] = useState({ name: '', roll: '', email: '', session: '2021-2022', department: 'CSE' })
  const [photo, setPhoto] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

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
      const matchesStatus = statusFilter === 'All' || student.status === statusFilter
      return matchesSearch && matchesDepartment && matchesSemester && matchesStatus
    })
  }, [students, search, department, semester, statusFilter])

  const summary = [
    { label: 'Total students', value: students.length, icon: Users, tone: 'emerald' },
    { label: 'Verified', value: students.filter((s) => s.status === 'Verified').length, icon: CheckCircle2, tone: 'sky' },
    { label: 'Pending review', value: students.filter((s) => s.status === 'Review').length, icon: BadgeCheck, tone: 'amber' },
    { label: 'Average attendance', value: `${Math.round(students.reduce((sum, s) => sum + Number.parseInt(s.attendance, 10), 0) / students.length)}%`, icon: BookOpen, tone: 'violet' },
  ]

  const resetStudentForm = () => {
    setForm({ name: '', roll: '', email: '', session: '2021-2022', department: 'CSE' })
    setPhoto(null)
    setPhotoName('')
  }

  const handleAddStudent = async (event) => {
    event.preventDefault()
    if (!form.name || !form.roll || !form.email) return

    try {
      const { data } = await api.post('/admin/students', {
        name: form.name,
        roll: form.roll,
        email: form.email,
        session: form.session,
        department: form.department,
      })

      if (photo) {
        const formData = new FormData()
        formData.append('photo', photo)
        await api.post(`/admin/students/${data.id}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      setStudents((current) => [{
        id: data.id,
        name: data.name,
        full_name: data.name,
        roll: data.roll,
        department: data.department,
        semester: '1-1',
        section: 'A',
        email: data.email,
        attendance: '0%',
        risk: 'High',
        status: 'Pending',
      }, ...current])
      resetStudentForm()
      setNotice(`Student ${data.name} saved to the database${photo ? ' with photo' : ''}.`)
    } catch (error) {
      setNotice(errorMessage(error, 'Student could not be created.'))
    }
  }

  const updateStatus = async (id, nextStatus) => {
    try {
      await api.patch(`/admin/students/${id}/status`, { status: nextStatus })
      setStudents((current) => current.map((student) => student.id === id ? { ...student, status: nextStatus } : student))
    } catch (error) {
      setNotice(errorMessage(error, 'Student status could not be updated.'))
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
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 ring-1 ring-sky-200">
            <ShieldAlert size={15} /> Verification queue active
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-${tone}-50 text-${tone}-700 ring-1 ring-${tone}-200`}>
                <Icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
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
              {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
            <select value={semester} onChange={(event) => setSemester(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
              <option value="All">All semesters</option>
              <option value="3-2">3-2</option>
              <option value="4-1">4-1</option>
              <option value="2-2">2-2</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
              <option value="All">All status</option>
              <option value="Verified">Verified</option>
              <option value="Review">Review</option>
              <option value="Suspended">Suspended</option>
              <option value="Pending">Pending</option>
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
                  <th className="px-4 py-3 font-semibold">Attendance</th>
                  <th className="px-4 py-3 font-semibold">Risk</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-stone-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-sm font-bold text-teal-800">
                          {student.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-stone-900">{student.name}</p>
                          <p className="text-xs text-stone-500">Section {student.section}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-700">{student.roll}</td>
                    <td className="px-4 py-3 text-stone-700">{student.department}</td>
                    <td className="px-4 py-3 text-stone-700">{student.semester}</td>
                    <td className="px-4 py-3 text-stone-700">{student.attendance}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${riskColors[student.risk]}`}>{student.risk}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusColors[student.status]}`}>{student.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => updateStatus(student.id, 'Verified')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Approve</button>
                        <button type="button" onClick={() => updateStatus(student.id, 'Review')} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">Review</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">New admission</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">Add student</h3>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-200">
              <UserRound size={18} />
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleAddStudent}>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Full name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Ayesha Rahman" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Roll</span>
              <input value={form.roll} onChange={(event) => setForm({ ...form, roll: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="2107001" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Academic email</span>
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 focus-within:border-emerald-400">
                <Mail size={15} className="text-stone-400" />
                <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent outline-none text-stone-700" placeholder="student@stud.kuet.ac.bd" required />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Student photo</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-600 hover:border-emerald-400 hover:bg-emerald-50/30">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <ImagePlus size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate">{photoName || 'Choose student photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0]
                    setPhoto(selected || null)
                    setPhotoName(selected ? selected.name : '')
                  }}
                />
              </label>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Session</span>
                <select value={form.session} onChange={(event) => setForm({ ...form, session: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  <option value="2020-2021">2020-2021</option>
                  <option value="2021-2022">2021-2022</option>
                  <option value="2022-2023">2022-2023</option>
                  <option value="2023-2024">2023-2024</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Department</span>
                <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              </label>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={resetStudentForm} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                <RotateCcw size={16} /> Clear form
              </button>
              <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <Plus size={16} /> Save student
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
