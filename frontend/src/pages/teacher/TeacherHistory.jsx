import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import api, { errorMessage } from '../../lib/api'

const CLASS_SLOT_COUNT = 15

function sortStudentsByRoll(students) {
  return [...students].sort((a, b) =>
    String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true, sensitivity: 'base' })
  )
}

export default function TeacherHistory() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSession, setSelectedSession] = useState('All Sessions')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadSheets() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/teacher/attendance-sheets')
        if (!cancelled) setSheets(data)
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, 'Could not load course attendance sheets.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSheets()
    return () => { cancelled = true }
  }, [reloadKey])

  const academicSessions = useMemo(
    () => ['All Sessions', ...new Set(sheets.map((sheet) => sheet.session).filter(Boolean))],
    [sheets]
  )
  const filteredSheets = useMemo(
    () => selectedSession === 'All Sessions'
      ? sheets
      : sheets.filter((sheet) => sheet.session === selectedSession),
    [sheets, selectedSession]
  )
  const selectedCourse = useMemo(
    () => sheets.find((sheet) => String(sheet.courseId) === courseId),
    [sheets, courseId]
  )
  const sortedStudents = useMemo(
    () => selectedCourse ? sortStudentsByRoll(selectedCourse.students) : [],
    [selectedCourse]
  )

  const retryLoad = () => setReloadKey((key) => key + 1)

  if (courseId) {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
          <button
            type="button"
            onClick={() => navigate('/teacher/history')}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-700"
          >
            <ArrowLeft size={16} />
            All courses
          </button>

          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading attendance sheet...</p>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{error}</span>
              <button type="button" onClick={retryLoad} className="font-semibold underline">Try again</button>
            </div>
          ) : selectedCourse ? (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {selectedCourse.session} · {selectedCourse.semester}, Section {selectedCourse.section}
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">
                    {selectedCourse.courseCode}: {selectedCourse.courseTitle}
                  </h2>
                </div>
                <div className="flex gap-5 text-sm">
                  <div>
                    <p className="text-xs text-stone-500">Classes held</p>
                    <p className="mt-1 font-semibold text-stone-900">{selectedCourse.classesHeld}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500">Course attendance</p>
                    <p className="mt-1 font-semibold text-emerald-800">{selectedCourse.percent}%</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4 text-xs text-stone-500">
                <p>P = Present <span className="mx-1">·</span> A = Absent <span className="mx-1">·</span> blank = class not held</p>
                {selectedCourse.classesHeld > CLASS_SLOT_COUNT && (
                  <p>Showing the latest {CLASS_SLOT_COUNT} class dates</p>
                )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-stone-600">This course attendance sheet is not available.</p>
              <button
                type="button"
                onClick={() => navigate('/teacher/history')}
                className="mt-3 text-sm font-semibold text-emerald-800 underline"
              >
                Back to courses
              </button>
            </div>
          )}
        </section>

        {!loading && !error && selectedCourse && (
          <section aria-label="Course attendance table" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="min-w-[1760px] border-collapse text-sm">
                <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th scope="col" className="sticky left-0 z-30 w-24 border-b border-r border-stone-200 bg-stone-50 px-3 py-3 text-left">
                      Roll
                    </th>
                    <th scope="col" className="sticky left-24 z-30 w-56 border-b border-r border-stone-200 bg-stone-50 px-3 py-3 text-left">
                      Student
                    </th>
                    {selectedCourse.classes.map((classSlot, index) => (
                      <th key={index} scope="col" className="w-24 border-b border-r border-stone-200 px-2 py-3 text-center">
                        <span className="block">Class {index + 1}</span>
                        <span className="mt-1 block whitespace-nowrap text-[10px] font-medium normal-case text-stone-500">
                          {classSlot?.date || '\u00a0'}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="w-28 border-b border-stone-200 px-3 py-3 text-right">
                      Attendance %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sortedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={CLASS_SLOT_COUNT + 3} className="px-4 py-10 text-center text-sm text-stone-500">
                        No students are enrolled in this course.
                      </td>
                    </tr>
                  ) : (
                    sortedStudents.map((student) => (
                      <tr key={`${student.studentId || student.roll}`} className="bg-white hover:bg-stone-50/70">
                        <td className="sticky left-0 z-10 w-24 border-r border-stone-100 bg-white px-3 py-3 font-semibold text-stone-700">
                          {student.roll}
                        </td>
                        <td className="sticky left-24 z-10 w-56 border-r border-stone-100 bg-white px-3 py-3 font-medium text-stone-900">
                          {student.name}
                        </td>
                        {student.attendance.map((status, index) => (
                          <td
                            key={index}
                            title={status || 'Class not held'}
                            className="w-24 border-r border-stone-100 px-2 py-3 text-center font-bold"
                          >
                            {status === 'Present' ? (
                              <span className="text-emerald-700">P</span>
                            ) : status === 'Absent' ? (
                              <span className="text-rose-700">A</span>
                            ) : null}
                          </td>
                        ))}
                        <td className="w-28 px-3 py-3 text-right font-semibold text-stone-800">
                          {student.attendancePercent}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Attendance</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Course attendance sheets</h2>
            <p className="mt-1 text-sm text-stone-500">One roll-wise sheet for each assigned course.</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <label className="sr-only" htmlFor="session-filter">Filter by academic session</label>
            <select
              id="session-filter"
              value={selectedSession}
              onChange={(event) => setSelectedSession(event.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
            >
              {academicSessions.map((session) => (
                <option key={session} value={session}>
                  {session === 'All Sessions' ? 'All academic sessions' : session}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={retryLoad} className="font-semibold underline">Try again</button>
        </div>
      )}

      <section aria-label="Assigned course attendance sheets" className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
            Loading course sheets...
          </div>
        ) : filteredSheets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
            No assigned courses found for this academic session.
          </div>
        ) : (
          filteredSheets.map((sheet) => (
            <article key={sheet.courseId} className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  {sheet.session} · {sheet.semester}, Section {sheet.section}
                </p>
                <h3 className="mt-1 truncate font-display text-lg font-bold text-stone-900">
                  {sheet.courseCode}: {sheet.courseTitle}
                </h3>
                <p className="mt-1 text-sm text-stone-500">
                  {sheet.classesHeld} classes held · {sheet.studentCount} students
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                <div className="text-right">
                  <p className="text-xs text-stone-500">Attendance</p>
                  <p className="font-semibold text-emerald-800">{sheet.percent}%</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/history/${sheet.courseId}`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <BookOpen size={16} />
                  Open sheet
                  <ArrowRight size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  )
}
