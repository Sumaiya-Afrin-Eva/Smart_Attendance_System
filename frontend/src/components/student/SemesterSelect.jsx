import { useEnrollments } from '../../lib/queries'

// Lets the student look at an older semester they were enrolled in
export default function SemesterSelect({ value, onChange }) {
  const { data: enrollments } = useEnrollments()
  const semesters = enrollments?.map((e) => e.semester) ?? []
  if (semesters.length < 2) return null
  return (
    <div className="relative">
      <select
        aria-label="Filter by Semester"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-11 rounded-xl border border-stone-300/80 bg-white px-4 pr-9 text-sm font-bold text-stone-800 shadow-2xs outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 cursor-pointer"
      >
        <option value="">Current Active Semester</option>
        {semesters.map((s) => (
          <option key={s} value={s}>
            Semester {s} History
          </option>
        ))}
      </select>
    </div>
  )
}
