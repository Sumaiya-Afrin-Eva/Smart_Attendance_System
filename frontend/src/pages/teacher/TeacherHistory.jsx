import { useMemo, useState } from 'react'
import { Clock3, BookOpen, Users, ArrowRight } from 'lucide-react'

const attendanceHistory = [
  {
    id: 1,
    courseCode: 'CSE 3101',
    courseTitle: 'Database Systems',
    title: 'CSE 3101: Database Systems',
    session: '2024-2025',
    semester: '3-2',
    date: 'Sep 28, 2026',
    time: '10:30 AM - 12:00 PM',
    room: 'CSE-401',
    total: 48,
    present: 45,
    percent: 93.8,
    attendees: [
      { roll: '2207001', name: 'Ayesha Rahman' },
      { roll: '2207002', name: 'Nabil Hasan' },
      { roll: '2207005', name: 'Sadia Akter' },
      { roll: '2207010', name: 'Tanvir Ahmed' },
      { roll: '2207012', name: 'Mim Rahman' },
      { roll: '2207021', name: 'Mahmudul Hassan' },
      { roll: '2207028', name: 'Faria Islam' },
      { roll: '2207034', name: 'Rakib Hossain' },
      { roll: '2207037', name: 'Marium Sultana' },
      { roll: '2207040', name: 'Shafkat Alam' },
      { roll: '2207045', name: 'Nusrat Jahan' },
      { roll: '2207048', name: 'Hasan Ali' },
    ],
  },
  {
    id: 2,
    courseCode: 'CSE 3105',
    courseTitle: 'Operating Systems',
    title: 'CSE 3105: Operating Systems',
    session: '2023-2024',
    semester: '3-2',
    date: 'Sep 24, 2026',
    time: '09:00 AM - 10:30 AM',
    room: 'CSE-303',
    total: 46,
    present: 42,
    percent: 91.3,
    attendees: [
      { roll: '2207101', name: 'Rafid Karim' },
      { roll: '2207104', name: 'Sanjida Chowdhury' },
      { roll: '2207112', name: 'Imran Bhuiyan' },
      { roll: '2207120', name: 'Nazia Sultana' },
      { roll: '2207125', name: 'Sakib Ahmed' },
      { roll: '2207130', name: 'Riya Akter' },
      { roll: '2207138', name: 'Farhan Kabir' },
      { roll: '2207141', name: 'Mitu Roy' },
      { roll: '2207147', name: 'Zahidul Islam' },
      { roll: '2207150', name: 'Mehnaz Hossain' },
      { roll: '2207154', name: 'Arifur Rahman' },
      { roll: '2207158', name: 'Tania Farin' },
    ],
  },
  {
    id: 3,
    courseCode: 'CSE 3207',
    courseTitle: 'Compiler Design',
    title: 'CSE 3207: Compiler Design',
    session: '2022-2023',
    semester: '4-1',
    date: 'Sep 22, 2026',
    time: '01:00 PM - 02:30 PM',
    room: 'CSE-207',
    total: 45,
    present: 40,
    percent: 88.9,
    attendees: [
      { roll: '2207201', name: 'Jahid Hasan' },
      { roll: '2207205', name: 'Sabiha Noor' },
      { roll: '2207212', name: 'Tashfia Islam' },
      { roll: '2207218', name: 'Sajid Hossain' },
      { roll: '2207220', name: 'Maily Akter' },
      { roll: '2207226', name: 'Jannat Ahmed' },
      { roll: '2207232', name: 'Ishrak Chowdhury' },
      { roll: '2207238', name: 'Naimul Islam' },
      { roll: '2207244', name: 'Fahim Hossain' },
      { roll: '2207249', name: 'Shahriar Alam' },
      { roll: '2207253', name: 'Oishi Sarker' },
      { roll: '2207258', name: 'Tanmoy Roy' },
    ],
  },
  {
    id: 4,
    courseCode: 'CSE 3301',
    courseTitle: 'Algorithms',
    title: 'CSE 3301: Algorithms',
    session: '2021-2022',
    semester: null,
    date: 'Jun 14, 2026',
    time: '11:00 AM - 12:30 PM',
    room: 'CSE-212',
    total: 44,
    present: 39,
    percent: 88.6,
    attendees: [
      { roll: '2207301', name: 'Shuvo Das' },
      { roll: '2207307', name: 'Moushumi Akter' },
      { roll: '2207315', name: 'Asif Ahmed' },
      { roll: '2207322', name: 'Ritu Sarkar' },
      { roll: '2207328', name: 'Nafiul Hasan' },
      { roll: '2207334', name: 'Sanjana Ali' },
      { roll: '2207341', name: 'Md. Tanvir' },
      { roll: '2207346', name: 'Nabila Islam' },
      { roll: '2207349', name: 'Touhidur Rahman' },
      { roll: '2207356', name: 'Amit Roy' },
      { roll: '2207364', name: 'Rashida Sultana' },
      { roll: '2207369', name: 'Shamiul Islam' },
    ],
  },
]

const academicSessions = ['All Sessions', '2021-2022', '2022-2023', '2023-2024', '2024-2025']

export default function TeacherHistory() {
  const [selectedSession, setSelectedSession] = useState('All Sessions')
  const [expandedLedgerId, setExpandedLedgerId] = useState(1)
  const [ledgerState, setLedgerState] = useState({})

  const filteredSessions = useMemo(() => {
    if (selectedSession === 'All Sessions') return attendanceHistory
    return attendanceHistory.filter((entry) => entry.session === selectedSession)
  }, [selectedSession])

  const toggleLedger = (id) => {
    setExpandedLedgerId((current) => (current === id ? null : id))
  }

  const getLedgerState = (sessionId) => ({
    searchTerm: '',
    sortOrder: 'asc',
    ...ledgerState[sessionId],
  })

  const updateLedgerState = (sessionId, patch) => {
    setLedgerState((current) => ({
      ...current,
      [sessionId]: {
        ...getLedgerState(sessionId),
        ...patch,
      },
    }))
  }

  const getSortedAttendees = (attendees, sortOrder) => {
    const normalized = [...attendees]
    normalized.sort((a, b) => {
      const rollA = Number(a.roll)
      const rollB = Number(b.roll)
      return sortOrder === 'asc' ? rollA - rollB : rollB - rollA
    })
    return normalized
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Record archive</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Class history and attendance logs</h2>
          </div>
          <div className="w-full max-w-md">
            <label className="sr-only" htmlFor="session-filter">Select academic session</label>
            <select
              id="session-filter"
              value={selectedSession}
              onChange={(event) => setSelectedSession(event.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
            >
              {academicSessions.map((session) => (
                <option key={session} value={session}>
                  {session === 'All Sessions' ? 'Filter by Session' : session}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            No class records found for this academic session.
          </div>
        ) : (
          filteredSessions.map((session) => (
            <article key={session.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                    {session.session}{session.semester ? ` (${session.semester})` : ''}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-stone-900">{session.title}</h3>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                  {session.percent}% attendance
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center gap-2 text-stone-500"><Clock3 size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Date</span></div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{session.date}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center gap-2 text-stone-500"><BookOpen size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Time</span></div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{session.time}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center gap-2 text-stone-500"><Users size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Present</span></div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{session.present} / {session.total}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center gap-2 text-stone-500"><ArrowRight size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Room</span></div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{session.room}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
                <div>
                  <p className="text-sm font-semibold text-stone-800">Student attendance sheet</p>
                  <p className="text-xs text-stone-500">All attendance records are preserved for this class.</p>
                </div>
                <button
                  onClick={() => toggleLedger(session.id)}
                  className="rounded-xl bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  {expandedLedgerId === session.id ? 'Close ledger' : 'Open ledger'}
                </button>
              </div>

              {expandedLedgerId === session.id && (() => {
                const ledger = getLedgerState(session.id)
                const visibleStudents = getSortedAttendees(
                  session.attendees.filter((student) =>
                    student.roll.toLowerCase().includes(ledger.searchTerm.toLowerCase()) ||
                    student.name.toLowerCase().includes(ledger.searchTerm.toLowerCase())
                  ),
                  ledger.sortOrder
                )

                return (
                  <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-50/80">
                    <div className="flex flex-col gap-3 border-b border-stone-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-semibold text-stone-900">Present students</p>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={ledger.searchTerm}
                          onChange={(event) => updateLedgerState(session.id, { searchTerm: event.target.value })}
                          placeholder="Search by roll or name"
                          className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 sm:w-56"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            updateLedgerState(session.id, {
                              sortOrder: ledger.sortOrder === 'asc' ? 'desc' : 'asc',
                            })
                          }
                          className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-700 hover:bg-stone-100 cursor-pointer"
                        >
                          Sort: {ledger.sortOrder === 'asc' ? 'Low → High' : 'High → Low'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <span>{visibleStudents.length} matched</span>
                      <span>{session.present} present</span>
                    </div>

                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleStudents.length === 0 ? (
                        <div className="col-span-full rounded-xl border border-dashed border-stone-200 bg-white px-3 py-6 text-center text-sm text-stone-500">
                          No student matches this roll or name.
                        </div>
                      ) : (
                        visibleStudents.map((student) => (
                          <div key={`${session.id}-${student.roll}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2">
                            <div>
                              <p className="text-lg font-bold text-stone-900">{student.roll}</p>
                              <p className="mt-1 text-sm text-stone-500">{student.name}</p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Present
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })()}
            </article>
          ))
        )}
      </section>
    </div>
  )
}
