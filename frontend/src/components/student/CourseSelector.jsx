import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckSquare } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'
import { useCourses, useEnrollments, useMeta } from '../../lib/queries'
import { useAuth } from '../../context/AuthContext'
import { Badge, Button, EmptyState, ErrorBox, Spinner, inputClass } from '../ui'

export default function CourseSelector({ profile, initialSemester, lockSemester = false, onSaved, submitLabel = 'Save Selected Courses' }) {
  const { setOnboarding } = useAuth()
  const queryClient = useQueryClient()
  const { data: meta } = useMeta()
  const [semester, setSemester] = useState(initialSemester ?? profile?.current_semester ?? '1-1')
  const { data: courses, isLoading } = useCourses(profile?.department, semester)
  const { data: enrollments } = useEnrollments()
  const [picked, setPicked] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const saved = enrollments?.find((e) => e.semester === semester)
  const selected = picked[semester] ?? new Set(saved?.courses.map((c) => c.id) ?? [])
  const setSelected = (next) => setPicked({ ...picked, [semester]: next })

  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setError('')
  }

  const credits = (courses ?? []).filter((c) => selected.has(c.id)).reduce((sum, c) => sum + c.credit, 0)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.put('/students/me/enrollments', { semester, course_ids: [...selected] })
      setOnboarding(data.onboarding)
      setPicked({})
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
      ])
      onSaved?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Semester & Select All Bar */}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="w-72">
          <label htmlFor="semester" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-700">
            Target Academic Semester
          </label>
          <select
            id="semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            disabled={lockSemester}
            className={inputClass}
          >
            {(meta?.semesters ?? [semester]).map((s) => (
              <option key={s} value={s}>
                Year {s[0]}, Term {s[2]} (Semester {s})
              </option>
            ))}
          </select>
        </div>

        {courses?.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set(courses.map((c) => c.id)))}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shadow-2xs"
          >
            <CheckSquare size={16} className="text-emerald-700" /> Select All Semester Courses
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner label="Loading available courses from syllabus…" />
      ) : !courses?.length ? (
        <EmptyState
          title={`No ${profile?.department} curriculum for Semester ${semester}`}
          text="The department administration has not published courses for this semester yet."
        />
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2">
          {courses.map((c) => {
            const on = selected.has(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  className={`flex w-full items-start gap-4 rounded-2xl border p-4.5 text-left transition-all duration-150 cursor-pointer ${
                    on
                      ? 'border-emerald-600 bg-gradient-to-r from-emerald-50/90 to-emerald-50/40 ring-2 ring-emerald-600/20 shadow-2xs'
                      : 'border-stone-200/90 bg-white hover:border-stone-300 hover:bg-stone-50/50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      on ? 'border-emerald-700 bg-emerald-700 text-white shadow-2xs' : 'border-stone-300 bg-white'
                    }`}
                  >
                    {on && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2.5">
                      <span className="font-display text-sm font-bold text-stone-900 font-mono">{c.code}</span>
                      <Badge tone={c.type === 'Lab' ? 'cyan' : 'slate'} className="text-xs">
                        {c.type}
                      </Badge>
                    </span>
                    <span className="mt-1.5 block font-display text-base font-semibold text-stone-800 leading-snug">{c.title}</span>
                    <span className="mt-1 block text-xs sm:text-sm font-medium text-stone-500 font-mono">{c.credit} Credit Units</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ErrorBox>{error}</ErrorBox>

      {/* Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f0eee6] pt-5">
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-700 font-medium">
          Selected: <strong className="text-stone-900 font-bold font-mono">{selected.size}</strong> courses · Total{' '}
          <strong className="text-emerald-800 font-bold font-mono">{credits}</strong> credits
        </div>
        <Button onClick={save} loading={saving} disabled={!selected.size} size="md">
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
