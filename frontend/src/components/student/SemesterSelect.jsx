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
        className="h-10 rounded-xl border border-slate-300/80 bg-white px-3.5 pr-8 text-xs font-bold text-slate-800 shadow-2xs outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 cursor-pointer"
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
