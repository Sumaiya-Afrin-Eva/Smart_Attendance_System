import { useEffect, useMemo, useState } from 'react'
import {
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  ImagePlus,
  Lock,
  Mail,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCog,
  UserRound,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const statusColors = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'On leave': 'bg-amber-50 text-amber-700 ring-amber-200',
  Pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  Disabled: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export default function TeacherManagement() {
  const [teachers, setTeachers] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', department: 'CSE', designation: 'Lecturer' })
  const [photo, setPhoto] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function loadTeachers() {
      try {
        const { data } = await api.get('/admin/teachers')
        setTeachers(data)
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load teachers.'))
      } finally {
        setLoading(false)
      }
    }
    loadTeachers()
  }, [])

  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const matchesSearch = `${teacher.name} ${teacher.email}`.toLowerCase().includes(search.toLowerCase())
      const matchesDepartment = department === 'All' || teacher.department === department
      const matchesStatus = statusFilter === 'All' || teacher.status === statusFilter
      return matchesSearch && matchesDepartment && matchesStatus
    })
  }, [teachers, search, department, statusFilter])

  const summary = [
    { label: 'Total teachers', value: teachers.length, icon: BriefcaseBusiness, tone: 'emerald' },
    { label: 'Active faculty', value: teachers.filter((t) => t.status === 'Active').length, icon: CheckCircle2, tone: 'sky' },
    { label: 'Pending review', value: teachers.filter((t) => t.status === 'Pending').length, icon: UserCog, tone: 'amber' },
    { label: 'Assigned courses', value: teachers.reduce((sum, t) => sum + t.courses, 0), icon: GraduationCap, tone: 'violet' },
  ]

  const resetTeacherForm = () => {
    setEditingId(null)
    setForm({ name: '', email: '', password: '', department: 'CSE', designation: 'Lecturer' })
    setPhoto(null)
    setPhotoName('')
  }

  const handleEditTeacher = (teacher) => {
    setEditingId(teacher.id)
    setForm({
      name: teacher.name || '',
      email: teacher.email || '',
      password: '',
      department: teacher.department || 'CSE',
      designation: teacher.designation || 'Lecturer',
    })
    setPhoto(null)
    setPhotoName('')
  }

  const handleAddTeacher = async (event) => {
    event.preventDefault()
    if (!form.name || !form.email) return

    try {
      const payload = {
        name: form.name,
        email: form.email,
        department: form.department,
        designation: form.designation,
      }

      if (form.password) payload.password = form.password

      let data
      if (editingId) {
        const response = await api.patch(`/admin/teachers/${editingId}`, payload)
        data = response.data
        setTeachers((current) => current.map((teacher) => teacher.id === editingId ? {
          ...teacher,
          ...data,
          name: data.name,
          email: data.email,
          department: data.department || form.department,
          designation: data.designation || form.designation,
          status: data.status || teacher.status,
        } : teacher))
        setNotice(`Teacher ${data.name} updated.`)
      } else {
        const response = await api.post('/admin/teachers', payload)
        data = response.data
        setTeachers((current) => [{
          ...data,
          department: data.department || form.department,
          designation: form.designation,
          courses: 0,
          students: 0,
          status: data.status || 'Active',
          lastLogin: 'Now',
        }, ...current])
        setNotice(`Teacher ${data.name} saved to the database${photo ? ' with photo' : ''}.`)
      }

      resetTeacherForm()
    } catch (error) {
      setNotice(errorMessage(error, editingId ? 'Teacher could not be updated.' : 'Teacher could not be created.'))
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/admin/teachers/${id}/status`, { status })
      setTeachers((current) => current.map((teacher) => teacher.id === id ? { ...teacher, status } : teacher))
    } catch (error) {
      setNotice(errorMessage(error, 'Teacher status could not be updated.'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Faculty control</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Teacher management</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck size={15} /> Access verified
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Faculty roster</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">Teachers</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="text" placeholder="Search name or email" className="w-44 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400" />
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
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none">
              <option value="All">All status</option>
              <option value="Active">Active</option>
              <option value="On leave">On leave</option>
              <option value="Pending">Pending</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>

          {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

          <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
            {loading ? (
              <div className="bg-white p-6 text-sm text-stone-500">Loading teachers...</div>
            ) : (
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Teacher</th>
                  <th className="px-4 py-3 font-semibold">Dept</th>
                  <th className="px-4 py-3 font-semibold">Courses</th>
                  <th className="px-4 py-3 font-semibold">Students</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-stone-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-800">
                          {teacher.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-stone-900">{teacher.name}</p>
                          <p className="text-xs text-stone-500">{teacher.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{teacher.department}</td>
                    <td className="px-4 py-3 text-stone-700">{teacher.courses}</td>
                    <td className="px-4 py-3 text-stone-700">{teacher.students}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusColors[teacher.status] || 'bg-stone-100 text-stone-700 ring-stone-200'}`}>
                        {teacher.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleEditTeacher(teacher)} className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100">Edit</button>
                        <button type="button" onClick={() => updateStatus(teacher.id, 'Active')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Approve</button>
                        <button type="button" onClick={() => updateStatus(teacher.id, 'On leave')} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">Leave</button>
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{editingId ? 'Update record' : 'New hire'}</p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900">{editingId ? 'Edit teacher' : 'Add teacher'}</h3>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-200">
              <UserRound size={18} />
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleAddTeacher}>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Full name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="Dr. Ayesha Sultana" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Academic email</span>
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 focus-within:border-emerald-400">
                <Mail size={15} className="text-stone-400" />
                <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent outline-none text-stone-700" placeholder="name@kuet.ac.bd" required />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Password</span>
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 focus-within:border-emerald-400">
                <Lock size={15} className="text-stone-400" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  className="w-full bg-transparent outline-none text-stone-700"
                  placeholder={editingId ? 'Leave blank to keep current password' : 'Create password'}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Teacher photo</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-600 hover:border-emerald-400 hover:bg-emerald-50/30">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <ImagePlus size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate">{photoName || 'Choose teacher photo'}</span>
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
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Department</span>
                <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  <option value="CSE">CSE</option>
                  <option value="EEE">EEE</option>
                  <option value="ECE">ECE</option>
                  <option value="ME">ME</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Designation</span>
                <select value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 outline-none focus:border-emerald-400">
                  <option value="Lecturer">Lecturer</option>
                  <option value="Assistant Professor">Assistant Professor</option>
                  <option value="Professor">Professor</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={resetTeacherForm} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                <RotateCcw size={16} /> {editingId ? 'Cancel edit' : 'Clear form'}
              </button>
              <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <Plus size={16} /> {editingId ? 'Save changes' : 'Save teacher'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
