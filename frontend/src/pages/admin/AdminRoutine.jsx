import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Plus,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit2,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  MapPin,
  UserCheck,
  BookOpen,
  LayoutGrid,
  List,
  RotateCcw,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
const DEPARTMENTS = ['CSE', 'EEE', 'ECE', 'ME', 'CE', 'IEM', 'BME', 'MSE', 'URP', 'ARCH', 'BECM', 'LE', 'TE', 'ChE', 'MTE', 'PHY', 'CHEM', 'MATH', 'HUM']
const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']
const SECTIONS = ['All', 'A', 'B']

const TIME_PRESETS = [
  { label: 'Period 1 (08:00 - 08:50 AM)', start: '08:00 AM', end: '08:50 AM' },
  { label: 'Period 2 (08:50 - 09:40 AM)', start: '08:50 AM', end: '09:40 AM' },
  { label: 'Period 3 (09:50 - 10:40 AM)', start: '09:50 AM', end: '10:40 AM' },
  { label: 'Period 4 (10:40 - 11:30 AM)', start: '10:40 AM', end: '11:30 AM' },
  { label: 'Period 5 (11:30 - 12:20 PM)', start: '11:30 AM', end: '12:20 PM' },
  { label: 'Lab Afternoon (02:30 - 05:00 PM)', start: '02:30 PM', end: '05:00 PM' },
]

export default function AdminRoutine() {
  const [routine, setRoutine] = useState([])
  const [courses, setCourses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [noticeType, setNoticeType] = useState('success') // success | error

  // Filters
  const [selectedDept, setSelectedDept] = useState('All')
  const [selectedDay, setSelectedDay] = useState('All')
  const [selectedTeacher, setSelectedTeacher] = useState('All')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // grid | faculty | table

  // Available teachers for filtering
  const availableTeachers = useMemo(() => {
    const list = new Set()
    routine.forEach((r) => {
      if (r.teacherName && r.teacherName !== 'TBA') list.add(r.teacherName)
    })
    teachers.forEach((t) => {
      if (t.name) list.add(t.name)
    })
    return Array.from(list).sort()
  }, [routine, teachers])

  // Manual Modal state
  const [showManualModal, setShowManualModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    department: 'CSE',
    semester: '3-1',
    section: 'A',
    day: 'Sunday',
    start_time: '08:00 AM',
    end_time: '08:50 AM',
    course_code: '',
    course_title: '',
    course_type: 'Theory',
    teacher_name: '',
    room: 'Room 301',
    session: '2025-2026',
  })

  // Bulk Upload Modal state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Fetch initial routine, courses, and teachers
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [routineRes, coursesRes, teachersRes] = await Promise.allSettled([
        api.get('/admin/routine'),
        api.get('/courses'),
        api.get('/admin/teachers'),
      ])

      if (routineRes.status === 'fulfilled') {
        setRoutine(routineRes.value.data)
      }
      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data)
      }
      if (teachersRes.status === 'fulfilled') {
        setTeachers(teachersRes.value.data)
      }
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to load routine data.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  function showNotice(msg, type = 'success') {
    setNotice(msg)
    setNoticeType(type)
    setTimeout(() => {
      setNotice('')
    }, 6000)
  }

  // Filtered routine list
  const filteredRoutine = useMemo(() => {
    return routine.filter((slot) => {
      const matchDept = selectedDept === 'All' || slot.department === selectedDept
      const matchDay = selectedDay === 'All' || slot.day === selectedDay
      let matchTeacher = selectedTeacher === 'All'
      if (!matchTeacher && slot.teacherName) {
        if (slot.teacherName === selectedTeacher) {
          matchTeacher = true
        } else {
          const cleanSelected = selectedTeacher.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*/i, '').trim().toLowerCase()
          const cleanSlot = slot.teacherName.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*/i, '').trim().toLowerCase()
          if (cleanSelected === cleanSlot || (cleanSelected.length > 5 && (cleanSlot.includes(cleanSelected) || cleanSelected.includes(cleanSlot)))) {
            matchTeacher = true
          }
        }
      }
      const query = search.trim().toLowerCase()
      const matchSearch =
        !query ||
        slot.courseCode?.toLowerCase().includes(query) ||
        slot.courseTitle?.toLowerCase().includes(query) ||
        slot.teacherName?.toLowerCase().includes(query) ||
        slot.room?.toLowerCase().includes(query)

      return matchDept && matchDay && matchTeacher && matchSearch
    })
  }, [routine, selectedDept, selectedDay, selectedTeacher, search])

  // Group by day for the grid view
  const routineByDay = useMemo(() => {
    const map = {}
    DAYS.forEach((d) => (map[d] = []))
    filteredRoutine.forEach((item) => {
      if (map[item.day]) {
        map[item.day].push(item)
      } else {
        map[item.day] = [item]
      }
    })
    // Sort each day's items by time
    Object.keys(map).forEach((d) => {
      map[d].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    })
    return map
  }, [filteredRoutine])

  // Group by teacher for the faculty schedule view
  const routineByTeacher = useMemo(() => {
    const map = {}
    filteredRoutine.forEach((item) => {
      const tName = item.teacherName || 'Unassigned Faculty'
      if (!map[tName]) map[tName] = []
      map[tName].push(item)
    })
    const dayOrder = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const dDiff = (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99)
        if (dDiff !== 0) return dDiff
        return (a.startTime || '').localeCompare(b.startTime || '')
      })
    })
    return map
  }, [filteredRoutine])

  // Statistics
  const stats = useMemo(() => {
    const uniqueCourses = new Set(filteredRoutine.map((r) => r.courseCode)).size
    const uniqueTeachers = new Set(filteredRoutine.map((r) => r.teacherName).filter(Boolean)).size
    const uniqueRooms = new Set(filteredRoutine.map((r) => r.room).filter(Boolean)).size
    const theoryCount = filteredRoutine.filter((r) => (r.courseType || '').toLowerCase() === 'theory').length
    const labCount = filteredRoutine.filter((r) => (r.courseType || '').toLowerCase().includes('lab') || (r.courseType || '').toLowerCase().includes('sessional')).length

    return {
      totalSlots: filteredRoutine.length,
      courses: uniqueCourses,
      teachers: uniqueTeachers,
      rooms: uniqueRooms,
      theoryCount,
      labCount,
    }
  }, [filteredRoutine])

  // Open manual add
  function openAddModal() {
    setEditingId(null)
    setForm({
      department: selectedDept !== 'All' ? selectedDept : 'CSE',
      semester: '1-1',
      section: 'A',
      day: selectedDay !== 'All' ? selectedDay : 'Sunday',
      start_time: '08:00 AM',
      end_time: '08:50 AM',
      course_code: '',
      course_title: '',
      course_type: 'Theory',
      teacher_name: '',
      room: 'Room 301',
      session: '2025-2026',
    })
    setShowManualModal(true)
  }

  // Open edit
  function openEditModal(slot) {
    setEditingId(slot.id)
    setForm({
      department: slot.department || 'CSE',
      semester: slot.semester || '3-1',
      section: slot.section || 'A',
      day: slot.day || 'Sunday',
      start_time: slot.startTime || '08:00 AM',
      end_time: slot.endTime || '08:50 AM',
      course_code: slot.courseCode || '',
      course_title: slot.courseTitle || '',
      course_type: slot.courseType || 'Theory',
      teacher_name: slot.teacherName || '',
      room: slot.room || '',
      session: slot.session || '2025-2026',
    })
    setShowManualModal(true)
  }

  // Handle course code selection autofill
  function handleCourseCodeChange(code) {
    const matched = courses.find((c) => c.code === code)
    if (matched) {
      setForm((prev) => ({
        ...prev,
        course_code: code,
        course_title: matched.title || prev.course_title,
        course_type: matched.course_type || prev.course_type,
        department: matched.department || prev.department,
        semester: matched.semester || prev.semester,
      }))
    } else {
      setForm((prev) => ({ ...prev, course_code: code }))
    }
  }

  // Save manual slot
  async function handleSaveManual(e) {
    e.preventDefault()
    if (!form.course_code || !form.start_time || !form.end_time) {
      showNotice('Please fill in Course Code, Start Time, and End Time.', 'error')
      return
    }

    try {
      if (editingId) {
        const { data } = await api.patch(`/admin/routine/${editingId}`, form)
        setRoutine((prev) => prev.map((s) => (s.id === editingId ? data : s)))
        showNotice(`Routine slot for ${data.courseCode} updated successfully.`)
      } else {
        const { data } = await api.post('/admin/routine', form)
        setRoutine((prev) => [...prev, data])
        showNotice(`Routine slot for ${data.courseCode} added successfully.`)
      }
      setShowManualModal(false)
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to save routine slot.'), 'error')
    }
  }

  // Delete slot
  async function handleDeleteSlot(id, courseCode) {
    if (!window.confirm(`Delete routine slot for ${courseCode}?`)) return
    try {
      await api.delete(`/admin/routine/${id}`)
      setRoutine((prev) => prev.filter((s) => s.id !== id))
      showNotice(`Routine slot deleted.`)
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to delete routine slot.'), 'error')
    }
  }

  // Clear filtered slots
  async function handleClearRoutine() {
    const isFiltered = selectedDept !== 'All'
    const confirmText = isFiltered
      ? `Are you sure you want to delete all routine slots for department ${selectedDept}?`
      : 'Are you sure you want to delete all routine slots?'
    if (!window.confirm(confirmText)) return

    try {
      const params = isFiltered ? { department: selectedDept } : {}
      await api.delete('/admin/routine/all', { params })
      const { data } = await api.get('/admin/routine')
      setRoutine(data)
      showNotice(isFiltered ? `Routine slots for ${selectedDept} deleted.` : 'All routine slots deleted successfully.')
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to delete routine.'), 'error')
    }
  }

  // Bulk Excel Upload
  async function handleExcelUpload(e) {
    e.preventDefault()
    if (!uploadFile) {
      showNotice('Please select an Excel or CSV file to upload.', 'error')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', uploadFile)

    try {
      const { data } = await api.post('/admin/routine/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      showNotice(`Routine import completed: Added ${data.added} slots. Skipped ${data.skipped} rows.`)
      setShowUploadModal(false)
      setUploadFile(null)
      // Reload routine
      const res = await api.get('/admin/routine')
      setRoutine(res.data)
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to import routine file.'), 'error')
    } finally {
      setUploading(false)
    }
  }

  // Download Template
  async function handleDownloadTemplate() {
    try {
      const response = await api.get('/admin/routine/template', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'class_routine_template.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      showNotice('Routine template downloaded.')
    } catch (err) {
      showNotice(errorMessage(err, 'Failed to download template.'), 'error')
    }
  }

  // Export current routine to CSV
  function handleExportCSV() {
    if (filteredRoutine.length === 0) {
      showNotice('No routine slots to export.', 'error')
      return
    }
    const headers = ['Day', 'Start Time', 'End Time', 'Course Code', 'Course Title', 'Course Type', 'Teacher', 'Room', 'Department', 'Semester', 'Section']
    const rows = filteredRoutine.map((r) => [
      r.day,
      r.startTime,
      r.endTime,
      r.courseCode,
      `"${r.courseTitle || ''}"`,
      r.courseType,
      `"${r.teacherName || ''}"`,
      r.room || '',
      r.department,
      r.semester,
      r.section,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    link.setAttribute('download', `class_routine_${selectedDept.toLowerCase()}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    showNotice('Routine exported successfully.')
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Alert Notice */}
      {notice && (
        <div
          className={`flex items-center justify-between rounded-2xl px-5 py-3.5 shadow-sm text-sm font-medium transition-all ${
            noticeType === 'error'
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {noticeType === 'error' ? (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            )}
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice('')} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CalendarDays className="h-3.5 w-3.5" />
              Academic Scheduling & Timetable
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
              Routine Management
            </h1>
            <p className="text-sm text-slate-600">
              Configure weekly period timetables, room distribution, and faculty assignments manually or via Excel spreadsheets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              title="Download sample excel/csv format"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Template
            </button>

            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50/70 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100/70 shadow-2xs transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Import Excel
            </button>

            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Class Slot
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4 pt-6 border-t border-slate-100">
          <div className="rounded-2xl bg-slate-50/80 p-4 border border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled Slots</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{stats.totalSlots}</span>
              <span className="text-xs text-slate-500">periods</span>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50/80 p-4 border border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unique Courses</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{stats.courses}</span>
              <span className="text-xs text-slate-500">subjects</span>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50/80 p-4 border border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Faculty</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-teal-700">{stats.teachers}</span>
              <span className="text-xs text-slate-500">teachers</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Department, Semester, Section filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              Filter:
            </div>

            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none"
            >
              <option value="All">All Depts</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none"
            >
              <option value="All">All Days</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none max-w-[170px] truncate"
            >
              <option value="All">All Teachers</option>
              {availableTeachers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Right actions: Search, View Mode, Export, Reset */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search routine..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-44 sm:w-56 rounded-xl border border-slate-200 bg-slate-50/70 pl-8.5 pr-3 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Weekly Schedule Grid"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </button>
              <button
                onClick={() => setViewMode('faculty')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  viewMode === 'faculty'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grouped by Faculty (Matches Excel format)"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Faculty
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="List Table"
              >
                <List className="h-3.5 w-3.5" />
                Table
              </button>
            </div>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              title="Export current view to CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              CSV
            </button>

            {routine.length > 0 && (
              <button
                type="button"
                onClick={handleClearRoutine}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-400 transition-colors shadow-2xs"
                title="Delete all routine slots"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                Clear Routine
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Routine Display */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200/80 bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
            <span className="text-xs font-semibold text-slate-500">Loading routine schedule...</span>
          </div>
        </div>
      ) : filteredRoutine.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 mb-3">
            <CalendarDays className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {routine.length === 0 ? 'No Routine Schedule Uploaded' : 'No Routine Slots Found'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            {routine.length === 0
              ? 'No class routines exist yet. Upload your timetable using an Excel or CSV file, or add class periods manually.'
              : 'No class routine slots match the selected filters. Try changing your department, day, or teacher filter.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-2xs"
            >
              <UploadCloud className="h-4 w-4" />
              Import Excel
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Plus className="h-4 w-4" />
              Add Class Slot
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* WEEKLY TIMETABLE GRID VIEW */
        <div className="space-y-4">
          {DAYS.map((day) => {
            const daySlots = routineByDay[day] || []
            if (selectedDay !== 'All' && selectedDay !== day) return null
            return (
              <div
                key={day}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition-all hover:border-slate-300"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 font-bold text-xs text-emerald-800">
                      {day.slice(0, 3)}
                    </span>
                    <h3 className="font-extrabold text-sm text-slate-800">{day}</h3>
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {daySlots.length} {daySlots.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setForm((prev) => ({ ...prev, day }))
                      setShowManualModal(true)
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    Add for {day.slice(0, 3)}
                  </button>
                </div>

                {/* Day Slots Grid */}
                <div className="p-4">
                  {daySlots.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400 italic">
                      No classes scheduled for {day}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      {daySlots.map((slot) => {
                        const isLab = slot.courseType?.toLowerCase().includes('lab')
                        return (
                          <div
                            key={slot.id}
                            className={`group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:shadow-md ${
                              isLab
                                ? 'border-purple-200 bg-gradient-to-br from-purple-50/40 via-white to-purple-50/20'
                                : 'border-slate-200/80 bg-white hover:border-emerald-300'
                            }`}
                          >
                            <div>
                              {/* Time & Badges */}
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                  <Clock className="h-2.5 w-2.5 text-slate-500" />
                                  {slot.startTime} - {slot.endTime}
                                </span>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                    isLab
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {slot.courseType || 'Theory'}
                                </span>
                              </div>

                              {/* Course Code & Title */}
                              <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-800 transition-colors">
                                {slot.courseCode}
                              </h4>
                              {slot.courseTitle && (
                                <p className="text-xs text-slate-600 line-clamp-1 mt-0.5 font-medium">
                                  {slot.courseTitle}
                                </p>
                              )}

                              {/* Teacher & Room */}
                              <div className="mt-3 space-y-1 text-xs">
                                {slot.teacherName && (
                                  <div className="flex items-center gap-1.5 text-slate-700 font-semibold truncate">
                                    <UserCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                                    <span className="truncate">{slot.teacherName}</span>
                                  </div>
                                )}
                                {slot.room && (
                                  <div className="flex items-center gap-1.5 text-slate-500 font-medium truncate">
                                    <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                    <span>{slot.room}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Footer: Metadata & Actions */}
                            <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
                              <span className="text-[10px] font-bold text-slate-400">
                                {slot.department} {slot.semester} (Sec {slot.section})
                              </span>

                              <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditModal(slot)}
                                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-700 transition-colors"
                                  title="Edit slot"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSlot(slot.id, slot.courseCode)}
                                  className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                  title="Delete slot"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : viewMode === 'faculty' ? (
        /* FACULTY TIMETABLE VIEW (Matches Excel format) */
        <div className="space-y-4">
          {Object.keys(routineByTeacher).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No faculty class slots match current filters.
            </div>
          ) : (
            Object.keys(routineByTeacher).map((tName) => {
              const teacherSlots = routineByTeacher[tName] || []
              const teacherTheory = teacherSlots.filter((s) => (s.courseType || '').toLowerCase() === 'theory').length
              const teacherLab = teacherSlots.length - teacherTheory

              return (
                <div
                  key={tName}
                  className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition-all hover:border-slate-300"
                >
                  {/* Faculty Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 font-bold text-xs text-white shadow-2xs">
                        {tName.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*/i, '').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">{tName}</h3>
                        <p className="text-[11px] text-slate-500 font-medium">Department of Computer Science & Engineering</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        {teacherSlots.length} Total Periods
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {teacherTheory} Theory · {teacherLab} Lab
                      </span>
                    </div>
                  </div>

                  {/* Slots Table for this teacher */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                          <th className="px-5 py-2.5">Day</th>
                          <th className="px-5 py-2.5">Time</th>
                          <th className="px-5 py-2.5">Course</th>
                          <th className="px-5 py-2.5">Slot Type</th>
                          <th className="px-5 py-2.5">Term & Section</th>
                          <th className="px-5 py-2.5">Room</th>
                          <th className="px-5 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {teacherSlots.map((slot) => {
                          const isLab = (slot.courseType || '').toLowerCase().includes('lab') || (slot.courseType || '').toLowerCase().includes('sessional')
                          return (
                            <tr key={slot.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-5 py-3 font-bold text-slate-800">{slot.day}</td>
                              <td className="px-5 py-3 font-semibold text-emerald-800">
                                {slot.startTime} - {slot.endTime}
                              </td>
                              <td className="px-5 py-3 font-black text-slate-900">
                                {slot.courseCode}
                                {slot.courseTitle && (
                                  <span className="block text-[11px] font-normal text-slate-500">{slot.courseTitle}</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    isLab
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {isLab ? 'Sessional / Lab' : 'Theory'}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-medium text-slate-600">
                                Term {slot.semester} · Sec {slot.section}
                              </td>
                              <td className="px-5 py-3 font-medium text-slate-600">{slot.room || 'TBA'}</td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => openEditModal(slot)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-700"
                                    title="Edit"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSlot(slot.id, slot.courseCode)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* LIST TABLE VIEW */
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Faculty / Teacher</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Dept & Term</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRoutine.map((slot) => {
                  const isLab = slot.courseType?.toLowerCase().includes('lab')
                  return (
                    <tr key={slot.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{slot.day}</td>
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-bold">
                          {slot.startTime} - {slot.endTime}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-slate-900">{slot.courseCode}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{slot.courseTitle}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                            isLab ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {slot.courseType || 'Theory'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{slot.teacherName || '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-600">{slot.room || '—'}</td>
                      <td className="px-4 py-3 font-bold text-slate-600">
                        {slot.department} {slot.semester} ({slot.section})
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(slot)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-700"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSlot(slot.id, slot.courseCode)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MANUAL ADD / EDIT MODAL */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {editingId ? 'Edit Routine Slot' : 'Add Class Routine Slot'}
                  </h3>
                  <p className="text-xs text-slate-500">Configure class timing, faculty, and venue.</p>
                </div>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-4">
              {/* Day & Academic Term */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-700">Day of Week</label>
                  <select
                    value={form.day}
                    onChange={(e) => setForm({ ...form, day: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700">Dept</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700">Semester</label>
                  <select
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time Presets / Custom Timing */}
              <div>
                <label className="text-[11px] font-bold text-slate-700">Time Slot Presets</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {TIME_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.label}
                      onClick={() => setForm({ ...form, start_time: p.start, end_time: p.end })}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                        form.start_time === p.start && form.end_time === p.end
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p.start} - {p.end}
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Start Time</label>
                    <input
                      type="text"
                      placeholder="e.g. 08:00 AM"
                      value={form.start_time}
                      onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">End Time</label>
                    <input
                      type="text"
                      placeholder="e.g. 08:50 AM"
                      value={form.end_time}
                      onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Course Selection */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[11px] font-bold text-slate-700">Course Code</label>
                  <input
                    type="text"
                    placeholder="CSE 3101"
                    value={form.course_code}
                    onChange={(e) => handleCourseCodeChange(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-700">Course Title</label>
                  <input
                    type="text"
                    placeholder="Theory of Computation"
                    value={form.course_title}
                    onChange={(e) => setForm({ ...form, course_title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Course Type & Section */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700">Type</label>
                  <select
                    value={form.course_type}
                    onChange={(e) => setForm({ ...form, course_type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Lab / Sessional</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700">Section</label>
                  <select
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                  </select>
                </div>
              </div>

              {/* Teacher & Room */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700">Faculty / Teacher</label>
                  <input
                    type="text"
                    list="teacher-suggestions"
                    placeholder="Select or enter teacher"
                    value={form.teacher_name}
                    onChange={(e) => setForm({ ...form, teacher_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:outline-none"
                  />
                  <datalist id="teacher-suggestions">
                    {teachers.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700">Room / Lab</label>
                  <input
                    type="text"
                    placeholder="e.g. Room 301, Lab 2"
                    value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-2xs"
                >
                  {editingId ? 'Save Changes' : 'Create Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXCEL / CSV BULK UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Import Routine from Excel / CSV
                  </h3>
                  <p className="text-xs text-slate-500">Upload department routine spreadsheets.</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExcelUpload} className="space-y-4">
              {/* File Dropzone */}
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center hover:bg-slate-50 transition-colors">
                <UploadCloud className="mx-auto h-9 w-9 text-emerald-600 mb-2" />
                <label className="block text-xs font-bold text-slate-800 cursor-pointer">
                  <span>{uploadFile ? uploadFile.name : 'Choose an Excel (.xlsx, .xls) or CSV file'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setUploadFile(e.target.files[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-500">
                  Supported formats: Excel (.xlsx, .xls) and standard CSV
                </p>
              </div>

              {/* Expected Column Format Guide */}
              <div className="rounded-2xl bg-emerald-50/60 p-4 border border-emerald-200/80 text-xs text-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-950 flex items-center gap-1.5 text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                    Expected Spreadsheet Columns
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    KUET Routine Format
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-200 bg-white p-3 font-mono text-[11px] font-semibold text-emerald-900 shadow-2xs">
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">Teacher / Lab / Class</span>
                  <span className="text-emerald-400 font-bold">|</span>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">Day</span>
                  <span className="text-emerald-400 font-bold">|</span>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">Start Time</span>
                  <span className="text-emerald-400 font-bold">|</span>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">End Time</span>
                  <span className="text-emerald-400 font-bold">|</span>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">Course</span>
                  <span className="text-emerald-400 font-bold">|</span>
                  <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2.5 py-1">Slot Type</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-emerald-900 pt-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Auto-assigns courses to teacher portals
                  </div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Auto-detects academic terms (1-1 to 4-2)
                  </div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Supports 24h & 12h times (e.g. 10:40, 13:10)
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Get Sample CSV / Template
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!uploadFile || uploading}
                    className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {uploading ? 'Importing...' : 'Upload & Process'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
