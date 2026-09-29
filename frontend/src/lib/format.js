const sameDay = (a, b) => a.toDateString() === b.toDateString()

export function formatDate(iso, { weekday = true } = {}) {
  return new Date(iso).toLocaleDateString('en-GB', {
    ...(weekday && { weekday: 'short' }),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// "Today", "Tomorrow" or "Mon, 28 Sep"
export function relativeDay(iso) {
  const date = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const formatPercent = (value) => (value == null ? '—' : `${Math.round(value)}%`)

export function formatMarks(course, fullMarks = 10) {
  if (course.grade === 'no_classes') return '—'
  if (course.grade === 'incomplete') return '—'
  return `${course.marks} / ${fullMarks}`
}
