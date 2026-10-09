import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import api, { errorMessage, fieldErrors } from '../../lib/api'
import { useMeta } from '../../lib/queries'
import { useAuth } from '../../context/AuthContext'
import { Button, ErrorBox, Field, inputClass } from '../ui'

// KUET emails often contain the roll, e.g. name2107001@stud.kuet.ac.bd
const rollFromEmail = (email = '') => email.match(/\d{7}/)?.[0] ?? ''

export default function ProfileForm({ profile, onSaved, submitLabel = 'Save Profile' }) {
  const { user, setOnboarding, refresh } = useAuth()
  const { data: meta } = useMeta()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? (user.name.includes('@') ? '' : user.name),
    roll: profile?.roll ?? rollFromEmail(user.email),
    department: profile?.department ?? 'CSE',
    series: profile?.series ?? '',
    session: profile?.session ?? '',
    current_semester: profile?.current_semester ?? '',
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (name) => (e) => {
    const value = e.target.value
    setForm({
      ...form,
      [name]: value,
      ...(name === 'session' ? { series: value.slice(0, 4) } : {}),
    })
    setErrors({ ...errors, [name]: undefined })
    setSaved(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data } = await api.put('/students/me/profile', form)
      setOnboarding(data.onboarding)
      queryClient.setQueryData(['profile'], data.profile)
      await refresh()
      setSaved(true)
      onSaved?.(data.profile)
    } catch (err) {
      setErrors(fieldErrors(err))
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const input = (name, props = {}) => (
    <input
      id={name}
      value={form[name]}
      onChange={set(name)}
      aria-invalid={Boolean(errors[name])}
      className={inputClass}
      {...props}
    />
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Full Legal Name" htmlFor="full_name" error={errors.full_name}>
            {input('full_name', { required: true, placeholder: 'e.g. Abdullah Al Mamun', autoComplete: 'name' })}
          </Field>
        </div>

        <Field label="University Email" htmlFor="email" hint="Linked with Google OAuth · Non-editable">
          <input
            id="email"
            value={user.email}
            disabled
            className={`${inputClass} bg-stone-100/60 text-stone-500 font-mono font-medium`}
          />
        </Field>

        <Field label="Student Roll Number" htmlFor="roll" error={errors.roll} hint="7 digits (e.g. 2107001)">
          {input('roll', { required: true, inputMode: 'numeric', maxLength: 7, placeholder: '2107001' })}
        </Field>

        <Field label="Department" htmlFor="department" error={errors.department}>
          <select id="department" value={form.department} onChange={set('department')} className={inputClass} required>
            {(meta?.departments ?? ['CSE']).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>

        <Field label="Academic Session" htmlFor="session" error={errors.session} hint="Must match the admin-approved roster">
          <select
            id="session"
            value={form.session}
            onChange={set('session')}
            className={inputClass}
            required
          >
            <option value="" disabled>Select your session</option>
            {(meta?.sessions ?? []).map((session) => (
              <option key={session} value={session}>{session}</option>
            ))}
          </select>
        </Field>

        <Field label="Current Semester" htmlFor="current_semester" error={errors.current_semester}>
          <select
            id="current_semester"
            value={form.current_semester}
            onChange={set('current_semester')}
            className={inputClass}
            required
          >
            <option value="" disabled>Select Current Semester</option>
            {(meta?.semesters ?? []).map((s) => (
              <option key={s} value={s}>
                Year {s[0]}, Term {s[2]} (Semester {s})
              </option>
            ))}
          </select>
        </Field>

      </div>

      <ErrorBox>{Object.keys(errors).length ? null : error}</ErrorBox>

      <div className="flex items-center justify-end gap-3 border-t border-[#f0eee6] pt-4">
        {saved && !onSaved && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 animate-fade-in">
            <Check size={14} /> Profile successfully saved!
          </span>
        )}
        <Button type="submit" loading={saving} size="md">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
