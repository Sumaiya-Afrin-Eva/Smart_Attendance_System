import { useMemo, useState, useEffect } from 'react'
import { Clock3, BookOpen, Users, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
import api from '../../lib/api'

export default function TeacherHistory() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState('All Sessions')
  const [academicSessions, setAcademicSessions] = useState(['All Sessions'])
  const [expandedLedgerId, setExpandedLedgerId] = useState(null)
  const [ledgerState, setLedgerState] = useState({})

  useEffect(() => {
    async function loadHistory() {
      try {
        const { data } = await api.get('/teacher/history')
        setSessions(data)
        if (data.length > 0) {
          setExpandedLedgerId(data[0].id)
          const foundSessions = ['All Sessions', ...new Set(data.map((d) => d.session).filter(Boolean))]
          setAcademicSessions(foundSessions)
        }
      } catch (err) {
        console.error('Failed to load teacher history', err)
      } finally {
        setLoading(false)
      }
    }
    loadHistory()
  }, [])

  const filteredSessions = useMemo(() => {
    if (selectedSession === 'All Sessions') return sessions
    return sessions.filter((entry) => entry.session === selectedSession)
  }, [sessions, selectedSession])

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
        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-sm font-medium text-stone-500 shadow-2xs">
            Loading attendance history and class logs...
          </div>
        ) : filteredSessions.length === 0 ? (
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
                  <div className="flex items-center gap-2 text-stone-500"><ArrowRight size={15} /> <span className="text-xs font-semibold uppercase tracking-wider">Room / Terminal</span></div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{session.room}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3">
                <div>
                  <p className="text-sm font-semibold text-stone-800">Student attendance sheet</p>
                  <p className="text-xs text-stone-500">Live face verified check-in records for this class.</p>
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
                      <p className="text-sm font-semibold text-stone-900">Present students ({session.present})</p>

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
                      <span>{session.present} verified</span>
                    </div>

                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleStudents.length === 0 ? (
                        <div className="col-span-full rounded-xl border border-dashed border-stone-200 bg-white px-3 py-6 text-center text-sm text-stone-500">
                          No student matches this roll or name.
                        </div>
                      ) : (
                        visibleStudents.map((student) => (
                          <div key={`${session.id}-${student.roll}`} className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-base font-bold text-stone-900">{student.name}</p>
                                <p className="text-xs font-medium text-stone-500">Roll: {student.roll} {student.department ? `· ${student.department}` : ''}</p>
                              </div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/20">
                                <CheckCircle2 size={12} /> {student.status}
                              </span>
                            </div>
                            
                            <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2 text-[11px] text-stone-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 size={12} className="text-stone-400" />
                                {student.time || 'Checked in'}
                              </span>
                              {student.confidence && (
                                <span className="font-semibold text-emerald-700">
                                  {student.confidence} match
                                </span>
                              )}
                            </div>
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
