import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Mail, Plus, RotateCcw, UserRound } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const emptyForm = { name: '', roll: '', email: '', session: '', department: 'CSE', phone: '' }

export default function StudentRosterForm() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(studentId)
  const [form, setForm] = useState(emptyForm)
  const [photo, setPhoto] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!studentId) return

    async function loadStudent() {
      try {
        const { data } = await api.get('/admin/students')
        const student = data.find((item) => String(item.id) === studentId)
        if (!student) {
          setNotice('Student roster record was not found.')
          return
        }
        setForm({
          name: student.name ?? '',
          roll: student.roll ?? '',
          email: student.email ?? '',
          session: student.session ?? '',
          department: student.department ?? 'CSE',
          phone: student.phone ?? '',
        })
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load this student record.'))
      } finally {
        setLoading(false)
      }
    }

    loadStudent()
  }, [studentId])

  const resetForm = () => {
    setForm(emptyForm)
    setPhoto(null)
    setPhotoName('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const { data } = editing
        ? await api.put(`/admin/students/${studentId}`, form)
        : await api.post('/admin/students', form)

      if (photo) {
        const formData = new FormData()
        formData.append('photo', photo)
        await api.post(`/admin/students/${data.id}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      navigate('/admin/students', {
        replace: true,
        state: { notice: `Official roster record for ${data.name} saved${photo ? ' with photo' : ''}.` },
      })
    } catch (error) {
      setNotice(errorMessage(error, 'Student record could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm text-stone-500">Loading student record...</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        type="button"
        onClick={() => navigate('/admin/students')}
        className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft size={16} /> Back to student records
      </button>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Admin-approved roster</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">{editing ? 'Edit student' : 'Add student'}</h2>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-200">
            <UserRound size={20} />
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          Saving an active roster record approves the KUET email for sign-in. The official photo can be added now or later.
        </p>

        {notice && (
          <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {notice}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Full name</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 outline-none focus:border-emerald-400" placeholder="Ayesha Rahman" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Roll</span>
            <input value={form.roll} onChange={(event) => setForm({ ...form, roll: event.target.value })} pattern="[0-9]{7}" maxLength={7} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 outline-none focus:border-emerald-400" placeholder="2107001" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Academic email</span>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 focus-within:border-emerald-400">
              <Mail size={16} className="shrink-0 text-stone-400" />
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent outline-none text-stone-700" placeholder="student@stud.kuet.ac.bd" required />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Student photo</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3.5 py-4 text-sm text-stone-600 hover:border-emerald-400 hover:bg-emerald-50/30">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <ImagePlus size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate">{photoName || 'Choose official photo (can add later)'}</span>
              <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => {
                const selected = event.target.files?.[0]
                setPhoto(selected || null)
                setPhotoName(selected ? selected.name : '')
              }} />
            </label>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Session</span>
              <input value={form.session} onChange={(event) => setForm({ ...form, session: event.target.value })} pattern="20[0-9]{2}-20[0-9]{2}" placeholder="2021-2022" className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 outline-none focus:border-emerald-400" required />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Department</span>
              <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 outline-none focus:border-emerald-400">
                <option value="CSE">CSE</option>
                <option value="EEE">EEE</option>
                <option value="ECE">ECE</option>
                <option value="ME">ME</option>
                <option value="CE">CE</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Admin-entered contact phone (optional)</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              pattern="(\+?88)?01[0-9]{9}"
              placeholder="01XXXXXXXXX"
              autoComplete="tel"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 outline-none focus:border-emerald-400"
            />
          </label>

          <div className="flex gap-3 border-t border-stone-100 pt-5">
            <button type="button" onClick={resetForm} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">
              <RotateCcw size={16} /> Clear form
            </button>
            <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Plus size={16} /> {saving ? 'Saving...' : editing ? 'Update student' : 'Save student'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
