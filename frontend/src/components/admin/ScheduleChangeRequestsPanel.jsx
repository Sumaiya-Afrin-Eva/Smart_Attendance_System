import { useEffect, useState } from 'react'
import { Bell, Check, Clock3, X } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function ScheduleChangeRequestsPanel() {
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  async function loadRequests() {
    try {
      const { data } = await api.get('/admin/schedule-change-requests')
      setRequests(data)
      setError('')
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not load schedule change notifications.'))
    }
  }

  useEffect(() => {
    loadRequests()
    const timer = window.setInterval(loadRequests, 30000)
    return () => window.clearInterval(timer)
  }, [])

  async function decide(requestId, status) {
    setWorkingId(requestId)
    setError('')
    try {
      await api.patch(`/admin/schedule-change-requests/${requestId}`, { status })
      await loadRequests()
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not update this schedule request.'))
    } finally {
      setWorkingId(null)
    }
  }

  const pendingCount = requests.filter((request) => request.status === 'pending').length
  const sortedRequests = [...requests].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return a.targetDate.localeCompare(b.targetDate)
  })

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-amber-700" />
            <h2 className="font-display text-lg font-bold text-stone-900">Teacher schedule notifications</h2>
            {pendingCount > 0 && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-800">{pendingCount} new</span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-500">Approve or reject one-day timetable changes. This list refreshes automatically.</p>
        </div>
        <button type="button" onClick={loadRequests} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {sortedRequests.length === 0 ? (
        <p className="mt-4 rounded-xl bg-stone-50 px-4 py-5 text-center text-sm text-stone-500">No teacher schedule change requests.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedRequests.map((request) => (
            <article key={request.id} className="flex flex-col gap-3 rounded-xl border border-stone-100 bg-stone-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-stone-900">{request.teacherName}</p>
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-stone-600">{request.department}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                    request.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : request.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>{request.status}</span>
                </div>
                <p className="mt-1 text-sm text-stone-700">
                  {request.courseCode} · Term {request.semester} · Section {request.section} · {request.room || 'Room TBA'}
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-600">
                  <Clock3 size={14} />
                  {request.targetDate}: {request.originalStartTime}–{request.originalEndTime}
                  <span aria-hidden="true">→</span>
                  <strong className="text-emerald-800">{request.requestedStartTime}–{request.requestedEndTime}</strong>
                </p>
              </div>
              {request.status === 'pending' && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={workingId === request.id}
                    onClick={() => decide(request.id, 'approved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={workingId === request.id}
                    onClick={() => decide(request.id, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
