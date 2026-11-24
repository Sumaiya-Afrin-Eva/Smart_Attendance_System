import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronUp,
  Clock3,
  Send,
  XCircle,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

function timeToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  if (match[3]) {
    hours %= 12
    if (match[3].toUpperCase() === 'PM') hours += 12
  }
  return hours * 60 + minutes
}

function toInputTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function toApiTime(value) {
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function dateForRoutineDay(day) {
  const dayNumbers = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
  const date = new Date()
  const daysUntil = (dayNumbers[day] - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysUntil)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayDateString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatRequestDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function requestStatus(status) {
  if (status === 'approved') {
    return { Icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-800', label: 'Approved' }
  }
  if (status === 'rejected') {
    return { Icon: XCircle, className: 'bg-rose-50 text-rose-800', label: 'Rejected' }
  }
  return { Icon: Clock3, className: 'bg-amber-50 text-amber-800', label: 'Pending' }
}

export default function TeacherScheduleChangeRequests({ routine }) {
  const [expanded, setExpanded] = useState(false)
  const [routineId, setRoutineId] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [startTime, setStartTime] = useState('14:30')
  const [endTime, setEndTime] = useState('')
  const [requests, setRequests] = useState([])
  const [notice, setNotice] = useState('')
  const [noticeType, setNoticeType] = useState('success')
  const [loading, setLoading] = useState(false)

  const selectedRoutine = useMemo(
    () => routine.find((slot) => String(slot.id) === routineId) || routine[0],
    [routine, routineId],
  )
  const selectedDate = targetDate || (selectedRoutine ? dateForRoutineDay(selectedRoutine.day) : '')
  const duration = Math.max(
    1,
    (timeToMinutes(selectedRoutine?.endTime) ?? 0) - (timeToMinutes(selectedRoutine?.startTime) ?? 0),
  )
  const selectedEndTime = endTime || toInputTime((timeToMinutes(startTime) ?? 870) + duration)

  async function fetchRequests() {
    const { data } = await api.get('/teacher/schedule-change-requests')
    return data
  }

  async function loadRequests() {
    try {
      setRequests(await fetchRequests())
    } catch (error) {
      setNoticeType('error')
      setNotice(errorMessage(error, 'Could not load your schedule change requests.'))
    }
  }

  useEffect(() => {
    let active = true
    const refreshRequests = async () => {
      try {
        const data = await fetchRequests()
        if (active) setRequests(data)
      } catch (error) {
        if (active) {
          setNoticeType('error')
          setNotice(errorMessage(error, 'Could not load your schedule change requests.'))
        }
      }
    }

    refreshRequests()
    const timer = window.setInterval(refreshRequests, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  async function submitRequest(event) {
    event.preventDefault()
    if (!selectedRoutine) return

    setLoading(true)
    setNotice('')
    try {
      await api.post('/teacher/schedule-change-requests', {
        routine_id: selectedRoutine.id,
        target_date: selectedDate,
        requested_start_time: toApiTime(startTime),
        requested_end_time: toApiTime(selectedEndTime),
      })
      setNoticeType('success')
      setNotice('Your schedule change request was sent to the department admin.')
      await loadRequests()
    } catch (error) {
      setNoticeType('error')
      setNotice(errorMessage(error, 'Could not send your schedule change request.'))
    } finally {
      setLoading(false)
    }
  }

  const selectedTimeLabel = selectedRoutine
    ? `${selectedRoutine.startTime}–${selectedRoutine.endTime}`
    : ''

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-2xs">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-800">
            <CalendarClock size={19} />
            <h3 className="font-display text-lg font-bold text-stone-900">One-time class time change</h3>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Request a date-specific schedule change from your department admin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          disabled={!routine.length}
          aria-expanded={expanded}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            expanded
              ? 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              : 'bg-emerald-800 text-white hover:bg-emerald-700'
          }`}
        >
          {expanded ? <ChevronUp size={16} /> : <Bell size={16} />}
          {expanded ? 'Hide form' : 'Request time change'}
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className={`mx-5 mb-4 rounded-xl px-4 py-3 text-sm sm:mx-6 ${
            noticeType === 'error'
              ? 'bg-rose-50 text-rose-800'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {notice}
        </p>
      )}

      {expanded && (
        <div className="border-t border-stone-100 px-5 py-5 sm:px-6">
          <form onSubmit={submitRequest} className="rounded-2xl bg-stone-50/80 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs font-semibold text-stone-600 sm:col-span-2 xl:col-span-2">
                Class
                <select
                  value={routineId || String(routine[0]?.id || '')}
                  onChange={(event) => {
                    const nextRoutine = routine.find((slot) => String(slot.id) === event.target.value)
                    setRoutineId(event.target.value)
                    setTargetDate(dateForRoutineDay(nextRoutine?.day))
                    setEndTime('')
                  }}
                  className="mt-1.5 block h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  required
                >
                  {routine.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.day} · {slot.courseCode} · {slot.startTime}–{slot.endTime}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-stone-600">
                Class date
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  min={todayDateString()}
                  className="mt-1.5 block h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  required
                />
              </label>

              <label className="text-xs font-semibold text-stone-600">
                New start
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-1.5 block h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  required
                />
              </label>

              <label className="text-xs font-semibold text-stone-600">
                New end
                <input
                  type="time"
                  value={selectedEndTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="mt-1.5 block h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  required
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-stone-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold text-stone-800">
                  {selectedRoutine?.courseCode || 'Selected class'} · {formatRequestDate(selectedDate)}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {selectedTimeLabel} <span className="mx-1">→</span> {toApiTime(startTime)}–{toApiTime(selectedEndTime)}
                </p>
              </div>
              <button
                type="submit"
                disabled={loading || !selectedRoutine}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={15} />
                {loading ? 'Sending request...' : 'Send request'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border-t border-stone-100 px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Your requests</h4>
          <span className="text-xs text-stone-400">{requests.length}</span>
        </div>

        {requests.length === 0 ? (
          <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
            Your submitted schedule change requests will appear here.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {requests.slice(0, 5).map((request) => {
              const { Icon, className, label } = requestStatus(request.status)
              return (
                <div key={request.id} className="flex flex-col gap-2 py-3 first:pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-800">
                      {request.courseCode} <span className="font-normal text-stone-400">·</span> {formatRequestDate(request.targetDate)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {request.originalStartTime && request.originalEndTime
                        ? `${request.originalStartTime}–${request.originalEndTime}  →  `
                        : ''}
                      {request.requestedStartTime}–{request.requestedEndTime}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${className}`}>
                    <Icon size={13} />
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
